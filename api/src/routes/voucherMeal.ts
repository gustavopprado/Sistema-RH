import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const voucherMealRouter = Router();

/**
 * Converte "YYYY-MM" -> 1º dia do mês em UTC (Date.UTC)
 * Evita variações de fuso ao comparar @db.Date.
 */
function parseMonthToDate(month: string): Date {
  const m = month.trim();
  const match = m.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("Formato de mês inválido. Use YYYY-MM");

  const year = Number(match[1]);
  const mon = Number(match[2]); // 1..12
  if (mon < 1 || mon > 12) throw new Error("Mês inválido");

  return new Date(Date.UTC(year, mon - 1, 1));
}

function monthRange(monthStart: Date) {
  const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const end = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

function asMoneyString(value: unknown): string {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(n)) throw new Error("Valor inválido");
  return n.toFixed(2);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function calcFromEmployee20(employee20: number): { employee20: string; company80: string; total100: string } {
  const e20 = round2(employee20);
  // 20% -> 100% = x5; 80% = x4
  const total = round2(e20 * 5);
  const company = round2(e20 * 4);

  return {
    employee20: e20.toFixed(2),
    company80: company.toFixed(2),
    total100: total.toFixed(2),
  };
}

function defaultAllocationForEmployee(e: { id: number }) {
  return {
    employeeId: e.id,
    employee20: "0.00",
    company80: "0.00",
    total100: "0.00",
  };
}

// GET /voucher-meal/invoices/by-month?month=YYYY-MM
voucherMealRouter.get("/invoices/by-month", async (req, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    if (!month) return res.status(400).json({ message: "month é obrigatório (YYYY-MM)" });

    const competence = parseMonthToDate(month);

    const invoice = await prisma.voucherMealInvoice.findUnique({
      where: { competence },
      select: {
        id: true,
        competence: true,
        invoiceSecondHalf: true,
        invoiceFirstHalfNext: true,
        status: true,
        closedAt: true,
      },
    });

    return res.json({
      invoice: invoice
        ? {
            id: invoice.id,
            competence: invoice.competence,
            invoiceSecondHalf: Number(invoice.invoiceSecondHalf).toFixed(2),
            invoiceFirstHalfNext: Number(invoice.invoiceFirstHalfNext).toFixed(2),
            status: invoice.status,
            closedAt: invoice.closedAt,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao carregar mês." });
  }
});

// POST /voucher-meal/invoices
// cria o mês se não existe; se já existir (inclusive corrida), retorna o existente.
voucherMealRouter.post("/invoices", async (req, res) => {
  try {
    const schema = z.object({
      month: z.string().min(1),
      invoiceSecondHalf: z.union([z.string().min(1), z.number()]).optional(),
      invoiceFirstHalfNext: z.union([z.string().min(1), z.number()]).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const competence = parseMonthToDate(parsed.data.month);

    const invoiceSecondHalf = asMoneyString(parsed.data.invoiceSecondHalf ?? 0);
    const invoiceFirstHalfNext = asMoneyString(parsed.data.invoiceFirstHalfNext ?? 0);

    const { start, end } = monthRange(competence);

    // ✅ funcionários que trabalharam no mês E participam do VR E NÃO são Filial 2
    const employees = await prisma.employee.findMany({
      where: {
        voucherMealExcluded: false,
        branch: { not: "2" }, // ✅ nunca incluir filial 2
        admissionDate: { lte: end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
      },
      select: { id: true },
    });

    const already = await prisma.voucherMealInvoice.findUnique({
      where: { competence },
      select: { id: true, status: true },
    });

    if (already) {
      if (already.status === "DRAFT" && employees.length) {
        await prisma.voucherMealAllocation.createMany({
          data: employees.map((e) => ({ invoiceId: already.id, ...defaultAllocationForEmployee(e) })),
          skipDuplicates: true,
        });
      }
      return res.status(200).json({ invoiceId: already.id, existed: true });
    }

    let invoiceId: number;

    try {
      const created = await prisma.voucherMealInvoice.create({
        data: {
          competence,
          invoiceSecondHalf,
          invoiceFirstHalfNext,
          status: "DRAFT",
          closedAt: null,
        },
        select: { id: true },
      });
      invoiceId = created.id;
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await prisma.voucherMealInvoice.findUnique({
          where: { competence },
          select: { id: true, status: true },
        });

        if (!existing) {
          console.error("P2002 ocorreu mas não encontrei invoice pela competence.", err);
          return res.status(500).json({ message: "Falha ao criar/carregar mês." });
        }

        if (existing.status === "DRAFT" && employees.length) {
          await prisma.voucherMealAllocation.createMany({
            data: employees.map((e) => ({ invoiceId: existing.id, ...defaultAllocationForEmployee(e) })),
            skipDuplicates: true,
          });
        }

        return res.status(200).json({ invoiceId: existing.id, existed: true });
      }

      console.error(err);
      return res.status(500).json({ message: "Erro interno ao criar mês." });
    }

    if (employees.length) {
      await prisma.voucherMealAllocation.createMany({
        data: employees.map((e) => ({ invoiceId, ...defaultAllocationForEmployee(e) })),
        skipDuplicates: true,
      });
    }

    return res.status(201).json({ invoiceId, existed: false });
  } catch (err: any) {
    const msg = err?.message || "Erro ao criar mês.";
    if (
      String(msg).includes("Formato de mês inválido") ||
      String(msg).includes("Mês inválido") ||
      String(msg).includes("Valor inválido")
    ) {
      return res.status(400).json({ message: msg });
    }

    console.error(err);
    return res.status(500).json({ message: "Erro interno ao criar mês." });
  }
});

// GET /voucher-meal/invoices/:id
voucherMealRouter.get("/invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.voucherMealInvoice.findUnique({
      where: { id },
      include: {
        allocations: {
          // ✅ nunca listar filial 2 e nunca listar excluídos
          where: {
            employee: {
              voucherMealExcluded: false,
              branch: { not: "2" },
            },
          },
          include: { employee: true },
        },
      },
    });

    if (!invoice) return res.status(404).json({ message: "Mês não encontrado" });

    const invA = Number(invoice.invoiceSecondHalf);
    const invB = Number(invoice.invoiceFirstHalfNext);
    const invoiceTotal = invA + invB;

    // ✅ totais calculados SOMENTE com o que aparece na lista
    const sumEmployee20 = invoice.allocations.reduce((acc, a) => acc + Number(a.employee20), 0);
    const sumCompany80 = invoice.allocations.reduce((acc, a) => acc + Number(a.company80), 0);
    const sumTotal100 = invoice.allocations.reduce((acc, a) => acc + Number(a.total100), 0);
    const diff = invoiceTotal - sumTotal100;

    return res.json({
      invoice: {
        id: invoice.id,
        competence: invoice.competence,
        invoiceSecondHalf: Number(invoice.invoiceSecondHalf).toFixed(2),
        invoiceFirstHalfNext: Number(invoice.invoiceFirstHalfNext).toFixed(2),
        status: invoice.status,
        closedAt: invoice.closedAt,
      },
      allocations: invoice.allocations
        .map((a) => ({
          id: a.id,
          employeeId: a.employeeId,
          employee20: Number(a.employee20).toFixed(2),
          company80: Number(a.company80).toFixed(2),
          total100: Number(a.total100).toFixed(2),
          employee: {
            id: a.employee.id,
            name: a.employee.name,
            matricula: a.employee.matricula,
            branch: a.employee.branch,
            costCenter: a.employee.costCenter,
            admissionDate: a.employee.admissionDate,
            terminationDate: a.employee.terminationDate,
          },
        }))
        .sort((x, y) => x.employee.name.localeCompare(y.employee.name, "pt-BR")),
      totals: {
        invoiceTotal: invoiceTotal.toFixed(2),
        sumTotal100: sumTotal100.toFixed(2),
        sumCompany80: sumCompany80.toFixed(2),
        sumEmployee20: sumEmployee20.toFixed(2),
        diff: diff.toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao carregar mês." });
  }
});

// PATCH /voucher-meal/invoices/:id
voucherMealRouter.patch("/invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const schema = z.object({
      invoiceSecondHalf: z.union([z.string().min(1), z.number()]).optional(),
      invoiceFirstHalfNext: z.union([z.string().min(1), z.number()]).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const invoice = await prisma.voucherMealInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) return res.status(404).json({ message: "Mês não encontrado" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    await prisma.voucherMealInvoice.update({
      where: { id },
      data: {
        invoiceSecondHalf:
          parsed.data.invoiceSecondHalf !== undefined ? asMoneyString(parsed.data.invoiceSecondHalf) : undefined,
        invoiceFirstHalfNext:
          parsed.data.invoiceFirstHalfNext !== undefined ? asMoneyString(parsed.data.invoiceFirstHalfNext) : undefined,
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || "Erro ao salvar mês.";
    if (String(msg).includes("Valor inválido")) return res.status(400).json({ message: msg });
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao salvar mês." });
  }
});

// PATCH /voucher-meal/invoices/:id/allocations/:employeeId
voucherMealRouter.patch("/invoices/:id/allocations/:employeeId", async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const employeeId = Number(req.params.employeeId);
    if (!invoiceId || !employeeId) return res.status(400).json({ message: "Parâmetros inválidos" });

    const schema = z.object({ employee20: z.union([z.string().min(1), z.number()]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const invoice = await prisma.voucherMealInvoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
    if (!invoice) return res.status(404).json({ message: "Mês não encontrado" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    // ✅ trava: filial 2 nunca deve ser editada aqui / e excluídos também não
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { branch: true, voucherMealExcluded: true },
    });
    if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });
    if (employee.branch === "2") return res.status(400).json({ message: "Filial 2 não é calculada nesta tela." });
    if (employee.voucherMealExcluded) return res.status(400).json({ message: "Funcionário excluído do Vale Refeição." });

    const e20 = Number(
      typeof parsed.data.employee20 === "string" ? parsed.data.employee20.replace(",", ".") : parsed.data.employee20
    );
    if (!Number.isFinite(e20) || e20 < 0) return res.status(400).json({ message: "Valor inválido" });

    const calc = calcFromEmployee20(e20);

    await prisma.voucherMealAllocation.update({
      where: { invoiceId_employeeId: { invoiceId, employeeId } },
      data: {
        employee20: calc.employee20,
        company80: calc.company80,
        total100: calc.total100,
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ message: "Lançamento não encontrado para este funcionário." });
    }
    const msg = err?.message || "Erro ao salvar valor.";
    if (String(msg).includes("Valor inválido")) return res.status(400).json({ message: msg });
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao salvar valor." });
  }
});
