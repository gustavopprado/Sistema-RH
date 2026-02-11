import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const unimedMonthlyRouter = Router();

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
  if (n < 0) throw new Error("Valor inválido");
  return n.toFixed(2);
}

function toCents(value: unknown): number {
  const n = Number(asMoneyString(value));
  return Math.round(n * 100);
}

function centsToString(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function listActiveEmployeesForCompetence(competence: Date) {
  const { start, end } = monthRange(competence);
  return prisma.employee.findMany({
    where: {
      admissionDate: { lte: end },
      OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
    },
    orderBy: [{ name: "asc" }],
  });
}

async function applyUnitToAllEmployees(tx: Prisma.TransactionClient, params: {
  invoiceId: number;
  competence: Date;
  unitValue: string; // "0.00"
}) {
  const employees = await tx.employee.findMany({
    where: {
      admissionDate: { lte: monthRange(params.competence).end },
      OR: [{ terminationDate: null }, { terminationDate: { gte: monthRange(params.competence).start } }],
    },
    select: { id: true },
  });

  const existing = await tx.unimedMonthlyAllocation.findMany({
    where: { invoiceId: params.invoiceId },
    select: { id: true, employeeId: true, dependents: true },
  });

  const unitCents = toCents(params.unitValue);
  const byEmp = new Map<number, { id: number; dependents: number }>();
  for (const a of existing) byEmp.set(a.employeeId, { id: a.id, dependents: a.dependents });

  const toCreate: Array<{ invoiceId: number; employeeId: number; dependents: number; amountTotal: string }> = [];
  const toUpdate: Array<{ id: number; amountTotal: string }> = [];

  for (const e of employees) {
    const hit = byEmp.get(e.id);
    const dependents = hit ? hit.dependents : 0;
    const amountCents = unitCents * (dependents + 1);
    const amountTotal = centsToString(amountCents);

    if (hit) {
      toUpdate.push({ id: hit.id, amountTotal });
    } else {
      toCreate.push({ invoiceId: params.invoiceId, employeeId: e.id, dependents, amountTotal });
    }
  }

  if (toCreate.length) {
    await tx.unimedMonthlyAllocation.createMany({ data: toCreate });
  }

  // Update individual (dependents varia por pessoa, então não dá pra fazer um único updateMany)
  for (const u of toUpdate) {
    await tx.unimedMonthlyAllocation.update({ where: { id: u.id }, data: { amountTotal: u.amountTotal } });
  }

  return { created: toCreate.length, updated: toUpdate.length };
}

// GET /unimed-monthly/invoices/by-month?month=YYYY-MM
unimedMonthlyRouter.get("/invoices/by-month", async (req, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    if (!month) return res.status(400).json({ message: "month é obrigatório (YYYY-MM)" });

    const competence = parseMonthToDate(month);

    const invoice = await prisma.unimedMonthlyInvoice.findUnique({
      where: { competence },
      select: {
        id: true,
        competence: true,
        invoiceNumber: true,
        invoiceValue: true,
        unitValue: true,
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
            unitValue: Number(invoice.unitValue).toFixed(2),
            status: invoice.status,
            closedAt: invoice.closedAt,
          }
        : null,
    });
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao carregar mês.";
    if (String(msg).includes("Formato de mês inválido") || String(msg).includes("Mês inválido")) {
      return res.status(400).json({ message: msg });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao carregar mês." });
  }
});

// POST /unimed-monthly/invoices
// cria o mês se não existe; se já existir (inclusive corrida), retorna o existente.
unimedMonthlyRouter.post("/invoices", async (req, res) => {
  try {
    const schema = z.object({
      month: z.string().min(1),
      invoiceNumber: z.string().min(1),
      invoiceValue: z.union([z.string().min(1), z.number()]),
      unitValue: z.union([z.string().min(1), z.number()]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const competence = parseMonthToDate(parsed.data.month);
    const invoiceNumber = parsed.data.invoiceNumber.trim();
    const invoiceValue = asMoneyString(parsed.data.invoiceValue);
    const unitValue = asMoneyString(parsed.data.unitValue);

    const already = await prisma.unimedMonthlyInvoice.findUnique({ where: { competence }, select: { id: true } });
    if (already) return res.status(200).json({ invoiceId: already.id, existed: true });

    try {
      const created = await prisma.unimedMonthlyInvoice.create({
        data: {
          competence,
          invoiceNumber,
          invoiceValue,
          unitValue,
          status: "DRAFT",
          closedAt: null,
        },
        select: { id: true },
      });

      // Ao criar, já aplica o valor unitário para todos os funcionários ativos do mês.
      await prisma.$transaction(async (tx) => {
        await applyUnitToAllEmployees(tx, {
          invoiceId: created.id,
          competence,
          unitValue,
        });
      });

      return res.status(201).json({ invoiceId: created.id, existed: false });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await prisma.unimedMonthlyInvoice.findUnique({ where: { competence }, select: { id: true } });
        if (!existing) return res.status(500).json({ message: "Falha ao criar/carregar mês." });
        return res.status(200).json({ invoiceId: existing.id, existed: true });
      }
      throw err;
    }
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao criar mês.";
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

// PATCH /unimed-monthly/invoices/:id  (salvar cabeçalho)
unimedMonthlyRouter.patch("/invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const schema = z.object({
      invoiceNumber: z.string().min(1),
      invoiceValue: z.union([z.string().min(1), z.number()]),
      unitValue: z.union([z.string().min(1), z.number()]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const invoice = await prisma.unimedMonthlyInvoice.findUnique({ where: { id }, select: { status: true, competence: true } });
    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    const invoiceNumber = parsed.data.invoiceNumber.trim();
    const invoiceValue = asMoneyString(parsed.data.invoiceValue);
    const unitValue = asMoneyString(parsed.data.unitValue);

    await prisma.$transaction(async (tx) => {
      await tx.unimedMonthlyInvoice.update({
        where: { id },
        data: {
          invoiceNumber,
          invoiceValue,
          unitValue,
        },
      });

      // Sempre que salvar o unitValue, recalcula e garante alocação para todos os ativos.
      await applyUnitToAllEmployees(tx, { invoiceId: id, competence: invoice.competence, unitValue });
    });

    return res.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao salvar nota.";
    if (String(msg).includes("Valor inválido")) return res.status(400).json({ message: msg });
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao salvar nota." });
  }
});

// POST /unimed-monthly/invoices/:id/apply-unit
unimedMonthlyRouter.post("/invoices/:id/apply-unit", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const schema = z.object({ unitValue: z.union([z.string().min(1), z.number()]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });

    const invoice = await prisma.unimedMonthlyInvoice.findUnique({ where: { id }, select: { status: true, competence: true } });
    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    const unitValue = asMoneyString(parsed.data.unitValue);

    const result = await prisma.$transaction(async (tx) => {
      await tx.unimedMonthlyInvoice.update({ where: { id }, data: { unitValue } });
      return applyUnitToAllEmployees(tx, { invoiceId: id, competence: invoice.competence, unitValue });
    });

    return res.json({ ok: true, ...result });
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao aplicar mensalidade.";
    if (String(msg).includes("Valor inválido")) return res.status(400).json({ message: msg });
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao aplicar mensalidade." });
  }
});

// GET /unimed-monthly/invoices/:id  (detalhes + lista de funcionários do mês)
unimedMonthlyRouter.get("/invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.unimedMonthlyInvoice.findUnique({
      where: { id },
      include: {
        allocations: { include: { employee: true } },
      },
    });

    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });

    const employees = await listActiveEmployeesForCompetence(invoice.competence);

    const invoiceValue = Number(invoice.invoiceValue);
    const unitValue = Number(invoice.unitValue);

    const sumTotal = invoice.allocations.reduce((acc, a) => acc + Number(a.amountTotal), 0);
    const diff = invoiceValue - sumTotal;

    const totalLives = invoice.allocations.reduce((acc, a) => acc + (a.dependents + 1), 0);

    return res.json({
      invoice: {
        id: invoice.id,
        competence: invoice.competence,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: Number(invoice.invoiceValue).toFixed(2),
        unitValue: Number(invoice.unitValue).toFixed(2),
        status: invoice.status,
        closedAt: invoice.closedAt,
      },
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        matricula: e.matricula,
        costCenter: e.costCenter,
        branch: e.branch,
        admissionDate: e.admissionDate,
        terminationDate: e.terminationDate,
        voucherMarketExcluded: e.voucherMarketExcluded,
        voucherMealExcluded: e.voucherMealExcluded,
      })),
      allocations: invoice.allocations
        .map((a) => ({
          id: a.id,
          invoiceId: a.invoiceId,
          employeeId: a.employeeId,
          dependents: a.dependents,
          amountTotal: Number(a.amountTotal).toFixed(2),
          employee: {
            id: a.employee.id,
            name: a.employee.name,
            matricula: a.employee.matricula,
            branch: a.employee.branch,
            costCenter: a.employee.costCenter,
            admissionDate: a.employee.admissionDate,
            terminationDate: a.employee.terminationDate,
            voucherMarketExcluded: a.employee.voucherMarketExcluded,
            voucherMealExcluded: a.employee.voucherMealExcluded,
          },
        }))
        .sort((a, b) => a.employee.name.localeCompare(b.employee.name, "pt-BR")),
      totals: {
        invoiceValue: invoiceValue.toFixed(2),
        unitValue: unitValue.toFixed(2),
        lives: totalLives,
        sumTotal: sumTotal.toFixed(2),
        diff: diff.toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao carregar invoice." });
  }
});

// PATCH /unimed-monthly/invoices/:id/allocations/:employeeId
unimedMonthlyRouter.patch("/invoices/:id/allocations/:employeeId", async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const employeeId = Number(req.params.employeeId);
    if (!invoiceId || !employeeId) return res.status(400).json({ message: "Parâmetros inválidos" });

    const schema = z.object({ dependents: z.number().int().min(0) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });

    const invoice = await prisma.unimedMonthlyInvoice.findUnique({ where: { id: invoiceId }, select: { status: true, unitValue: true, competence: true } });
    if (!invoice) return res.status(404).json({ message: "Mês não encontrado" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    const unitValue = Number(invoice.unitValue);
    if (!Number.isFinite(unitValue) || unitValue <= 0) {
      return res.status(400).json({ message: "Defina o valor unitário da mensalidade antes de ajustar dependentes." });
    }

    // valida se o funcionário está ativo no mês
    const { start, end } = monthRange(invoice.competence);
    const emp = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        admissionDate: { lte: end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
      },
      select: { id: true },
    });
    if (!emp) return res.status(404).json({ message: "Funcionário não está ativo neste mês." });

    const deps = parsed.data.dependents;
    const unitCents = toCents(unitValue);
    const amountCents = unitCents * (deps + 1);
    const amountTotal = centsToString(amountCents);

    await prisma.unimedMonthlyAllocation.upsert({
      where: {
        invoiceId_employeeId: {
          invoiceId,
          employeeId,
        },
      },
      create: {
        invoiceId,
        employeeId,
        dependents: deps,
        amountTotal,
      },
      update: {
        dependents: deps,
        amountTotal,
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao salvar dependentes.";
    console.error(err);
    return res.status(500).json({ message: msg });
  }
});

// POST /unimed-monthly/invoices/:id/close
unimedMonthlyRouter.post("/invoices/:id/close", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.unimedMonthlyInvoice.findUnique({
      where: { id },
      include: { allocations: true },
    });

    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "CLOSED") return res.status(200).json({ ok: true, status: "CLOSED" });

    const invoiceCents = toCents(invoice.invoiceValue);
    const sumCents = invoice.allocations.reduce((acc, a) => acc + toCents(a.amountTotal), 0);
    const diffCents = invoiceCents - sumCents;

    if (Math.abs(diffCents) >= 1) {
      return res.status(400).json({
        message: "Não é possível fechar: a soma das mensalidades não bate com a nota fiscal.",
        diff: centsToString(diffCents),
        sumTotal: centsToString(sumCents),
        invoiceValue: centsToString(invoiceCents),
      });
    }

    await prisma.unimedMonthlyInvoice.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    return res.json({ ok: true, status: "CLOSED" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao fechar mês." });
  }
});

// POST /unimed-monthly/invoices/:id/reopen
unimedMonthlyRouter.post("/invoices/:id/reopen", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.unimedMonthlyInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "DRAFT") return res.json({ ok: true, status: "DRAFT" });

    await prisma.unimedMonthlyInvoice.update({ where: { id }, data: { status: "DRAFT", closedAt: null } });
    return res.json({ ok: true, status: "DRAFT" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao reabrir mês." });
  }
});
