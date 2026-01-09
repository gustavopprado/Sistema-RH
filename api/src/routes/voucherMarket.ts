import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const voucherMarketRouter = Router();

const BASE_VALE_MERCADO = "541.00";

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

/**
 * ✅ IMPORTANTE: tipar o retorno evita que o TS “alargue” status para string,
 * e assim o createMany aceita o tipo corretamente.
 */
function defaultAllocationForEmployee(e: { id: number; voucherMarketExcluded: boolean }): {
  employeeId: number;
  amount: string;
  status: "DEFAULT" | "EXCLUIDO";
  note: null;
} {
  return {
    employeeId: e.id,
    amount: e.voucherMarketExcluded ? "0.00" : BASE_VALE_MERCADO,
    status: e.voucherMarketExcluded ? "EXCLUIDO" : "DEFAULT",
    note: null,
  };
}

// GET /voucher-market/invoices/by-month?month=YYYY-MM
voucherMarketRouter.get("/invoices/by-month", async (req, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    if (!month) return res.status(400).json({ message: "month é obrigatório (YYYY-MM)" });

    const competence = parseMonthToDate(month);

    const invoice = await prisma.voucherMarketInvoice.findUnique({
      where: { competence },
      select: {
        id: true,
        competence: true,
        invoiceNumber: true,
        invoiceValue: true,
        status: true,
        closedAt: true,
      },
    });

    return res.json({
      invoice: invoice
        ? {
            id: invoice.id,
            competence: invoice.competence,
            invoiceNumber: invoice.invoiceNumber,
            invoiceValue: Number(invoice.invoiceValue).toFixed(2),
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

// POST /voucher-market/invoices
// cria o mês se não existe; se já existir (inclusive corrida), retorna o existente.
voucherMarketRouter.post("/invoices", async (req, res) => {
  try {
    const schema = z.object({
      month: z.string().min(1),
      invoiceNumber: z.string().min(1),
      invoiceValue: z.union([z.string().min(1), z.number()]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const competence = parseMonthToDate(parsed.data.month);
    const invoiceNumber = parsed.data.invoiceNumber.trim();
    const invoiceValue = asMoneyString(parsed.data.invoiceValue);
    const { start, end } = monthRange(competence);

    // funcionários que trabalharam no mês + flag persistente de exclusão
    const employees = await prisma.employee.findMany({
      where: {
        admissionDate: { lte: end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
      },
      select: { id: true, voucherMarketExcluded: true },
    });

    // Se já existe, retorna e garante allocations de novos funcionários (respeitando flag)
    const already = await prisma.voucherMarketInvoice.findUnique({
      where: { competence },
      select: { id: true, status: true },
    });

    if (already) {
      if (already.status === "DRAFT" && employees.length) {
        await prisma.voucherMarketAllocation.createMany({
          data: employees.map((e) => ({
            invoiceId: already.id, // ✅ aqui é already.id
            ...defaultAllocationForEmployee(e),
          })),
          skipDuplicates: true,
        });
      }

      return res.status(200).json({ invoiceId: already.id, existed: true });
    }

    // Se não existe, tenta criar. Se der corrida e estourar unique (P2002), busca e retorna.
    let invoiceId: number;

    try {
      const created = await prisma.voucherMarketInvoice.create({
        data: {
          competence,
          invoiceNumber,
          invoiceValue,
          status: "DRAFT",
          closedAt: null,
        },
        select: { id: true },
      });
      invoiceId = created.id;
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await prisma.voucherMarketInvoice.findUnique({
          where: { competence },
          select: { id: true, status: true },
        });

        if (!existing) {
          console.error("P2002 ocorreu mas não encontrei invoice pela competence.", err);
          return res.status(500).json({ message: "Falha ao criar/carregar mês." });
        }

        // garante allocations se ainda estiver em DRAFT (respeitando flag)
        if (existing.status === "DRAFT" && employees.length) {
          await prisma.voucherMarketAllocation.createMany({
            data: employees.map((e) => ({
              invoiceId: existing.id,
              ...defaultAllocationForEmployee(e),
            })),
            skipDuplicates: true,
          });
        }

        return res.status(200).json({ invoiceId: existing.id, existed: true });
      }

      console.error(err);
      return res.status(500).json({ message: "Erro interno ao criar mês." });
    }

    // cria allocations do mês recém criado (respeitando flag)
    if (employees.length) {
      await prisma.voucherMarketAllocation.createMany({
        data: employees.map((e) => ({
          invoiceId,
          ...defaultAllocationForEmployee(e),
        })),
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

// GET /voucher-market/invoices/:id
voucherMarketRouter.get("/invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.voucherMarketInvoice.findUnique({
      where: { id },
      include: { allocations: { include: { employee: true } } },
    });

    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });

    const invoiceValue = Number(invoice.invoiceValue);
    const sumAllocations = invoice.allocations.reduce((acc, a) => acc + Number(a.amount), 0);
    const diff = invoiceValue - sumAllocations;

    return res.json({
      invoice: {
        id: invoice.id,
        competence: invoice.competence,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: Number(invoice.invoiceValue).toFixed(2),
        status: invoice.status,
        closedAt: invoice.closedAt,
      },
      baseValue: Number(BASE_VALE_MERCADO).toFixed(2),
      allocations: invoice.allocations
        .map((a) => ({
          id: a.id,
          employeeId: a.employeeId,
          amount: Number(a.amount).toFixed(2),
          status: a.status,
          note: a.note,
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
        sumAllocations: sumAllocations.toFixed(2),
        diff: diff.toFixed(2),
        company95: (invoiceValue * 0.95).toFixed(2),
        employees5: (invoiceValue * 0.05).toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao carregar invoice." });
  }
});

// POST /voucher-market/invoices/:id/close
// ✅ recebe nota + allocations, salva tudo e fecha; atualiza flag persistente de exclusão
voucherMarketRouter.post("/invoices/:id/close", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const schema = z.object({
      invoiceNumber: z.string().min(1),
      invoiceValue: z.union([z.string().min(1), z.number()]),
      allocations: z.array(
        z.object({
          employeeId: z.number().int().positive(),
          amount: z.union([z.string().min(1), z.number()]),
          status: z.enum(["DEFAULT", "FALTA", "PROPORCIONAL", "EXCLUIDO"]),
        })
      ),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const invoice = await prisma.voucherMarketInvoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "CLOSED") return res.status(200).json({ ok: true, status: "CLOSED" });

    const newInvoiceValue = Number(asMoneyString(parsed.data.invoiceValue));
    const sumAllocations = parsed.data.allocations.reduce((acc, a) => acc + Number(asMoneyString(a.amount)), 0);
    const diff = Number((newInvoiceValue - sumAllocations).toFixed(2));

    if (Math.abs(diff) >= 0.01) {
      return res.status(400).json({
        message: "Não é possível fechar: a soma dos funcionários não bate com a nota.",
        diff: diff.toFixed(2),
        sumAllocations: sumAllocations.toFixed(2),
        invoiceValue: newInvoiceValue.toFixed(2),
      });
    }

    await prisma.$transaction(async (tx) => {
      // atualiza cabeçalho e fecha
      await tx.voucherMarketInvoice.update({
        where: { id },
        data: {
          invoiceNumber: parsed.data.invoiceNumber.trim(),
          invoiceValue: asMoneyString(parsed.data.invoiceValue),
          status: "CLOSED",
          closedAt: new Date(),
        },
      });

      // salva allocations
      for (const a of parsed.data.allocations) {
        await tx.voucherMarketAllocation.upsert({
          where: { invoiceId_employeeId: { invoiceId: id, employeeId: a.employeeId } },
          update: {
            amount: asMoneyString(a.amount),
            status: a.status,
          },
          create: {
            invoiceId: id,
            employeeId: a.employeeId,
            amount: asMoneyString(a.amount),
            status: a.status,
            note: null,
          },
        });
      }

      // persistência da exclusão para o próximo mês
      const excludedIds = parsed.data.allocations.filter((a) => a.status === "EXCLUIDO").map((a) => a.employeeId);
      const includedIds = parsed.data.allocations.filter((a) => a.status !== "EXCLUIDO").map((a) => a.employeeId);

      if (excludedIds.length) {
        await tx.employee.updateMany({
          where: { id: { in: excludedIds } },
          data: { voucherMarketExcluded: true },
        });
      }
      if (includedIds.length) {
        await tx.employee.updateMany({
          where: { id: { in: includedIds } },
          data: { voucherMarketExcluded: false },
        });
      }
    });

    return res.json({ ok: true, status: "CLOSED" });
  } catch (err: any) {
    console.error(err);
    const msg = err?.message || "Erro interno ao fechar mês.";
    if (String(msg).includes("Valor inválido")) return res.status(400).json({ message: msg });
    return res.status(500).json({ message: "Erro interno ao fechar mês." });
  }
});

// POST /voucher-market/invoices/:id/reopen
voucherMarketRouter.post("/invoices/:id/reopen", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.voucherMarketInvoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "DRAFT") return res.json({ ok: true, status: "DRAFT" });

    await prisma.voucherMarketInvoice.update({
      where: { id },
      data: { status: "DRAFT", closedAt: null },
    });

    return res.json({ ok: true, status: "DRAFT" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao reabrir mês." });
  }
});
