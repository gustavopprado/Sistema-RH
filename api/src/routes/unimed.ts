import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const unimedRouter = Router();

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

function splitUnimed(kind: "PERSONAL" | "WORK_ACCIDENT", amountTotal: unknown) {
  const totalCents = toCents(amountTotal);
  if (kind === "WORK_ACCIDENT") {
    return {
      amountTotal: centsToString(totalCents),
      amountEmployee: "0.00",
      amountCompany: centsToString(totalCents),
    };
  }

  // PERSONAL: 30% funcionário, 70% empresa. Para evitar divergência, empresa é o "restante".
  const empCents = Math.round(totalCents * 0.3);
  const compCents = totalCents - empCents;
  return {
    amountTotal: centsToString(totalCents),
    amountEmployee: centsToString(empCents),
    amountCompany: centsToString(compCents),
  };
}

// GET /unimed/invoices/by-month?month=YYYY-MM
unimedRouter.get("/invoices/by-month", async (req, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    if (!month) return res.status(400).json({ message: "month é obrigatório (YYYY-MM)" });

    const competence = parseMonthToDate(month);

    const invoice = await prisma.unimedInvoice.findUnique({
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
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao carregar mês.";
    if (String(msg).includes("Formato de mês inválido") || String(msg).includes("Mês inválido")) {
      return res.status(400).json({ message: msg });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao carregar mês." });
  }
});

// POST /unimed/invoices
// cria o mês se não existe; se já existir (inclusive corrida), retorna o existente.
unimedRouter.post("/invoices", async (req, res) => {
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

    const already = await prisma.unimedInvoice.findUnique({
      where: { competence },
      select: { id: true },
    });

    if (already) return res.status(200).json({ invoiceId: already.id, existed: true });

    try {
      const created = await prisma.unimedInvoice.create({
        data: {
          competence,
          invoiceNumber,
          invoiceValue,
          status: "DRAFT",
          closedAt: null,
        },
        select: { id: true },
      });
      return res.status(201).json({ invoiceId: created.id, existed: false });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await prisma.unimedInvoice.findUnique({ where: { competence }, select: { id: true } });
        if (!existing) return res.status(500).json({ message: "Falha ao criar/carregar mês." });
        return res.status(200).json({ invoiceId: existing.id, existed: true });
      }
      throw err;
    }
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao criar mês.";
    if (String(msg).includes("Formato de mês inválido") || String(msg).includes("Mês inválido") || String(msg).includes("Valor inválido")) {
      return res.status(400).json({ message: msg });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao criar mês." });
  }
});

// PATCH /unimed/invoices/:id  (salvar cabeçalho)
unimedRouter.patch("/invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const schema = z.object({
      invoiceNumber: z.string().min(1),
      invoiceValue: z.union([z.string().min(1), z.number()]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const invoice = await prisma.unimedInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    await prisma.unimedInvoice.update({
      where: { id },
      data: {
        invoiceNumber: parsed.data.invoiceNumber.trim(),
        invoiceValue: asMoneyString(parsed.data.invoiceValue),
      },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao salvar nota.";
    if (String(msg).includes("Valor inválido")) return res.status(400).json({ message: msg });
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao salvar nota." });
  }
});

// GET /unimed/invoices/:id  (detalhes + lista de funcionários do mês)
unimedRouter.get("/invoices/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.unimedInvoice.findUnique({
      where: { id },
      include: {
        usages: { include: { employee: true } },
      },
    });

    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });

    const { start, end } = monthRange(invoice.competence);
    const employees = await prisma.employee.findMany({
      where: {
        admissionDate: { lte: end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
      },
      orderBy: [{ name: "asc" }],
    });

    const invoiceValue = Number(invoice.invoiceValue);
    const sumTotal100 = invoice.usages.reduce((acc, u) => acc + Number(u.amountTotal), 0);
    const sumEmployee = invoice.usages.reduce((acc, u) => acc + Number(u.amountEmployee), 0);
    const sumCompany = invoice.usages.reduce((acc, u) => acc + Number(u.amountCompany), 0);
    const diff = invoiceValue - sumTotal100;

    return res.json({
      invoice: {
        id: invoice.id,
        competence: invoice.competence,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: Number(invoice.invoiceValue).toFixed(2),
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
      usages: invoice.usages
        .map((u) => ({
          id: u.id,
          invoiceId: u.invoiceId,
          employeeId: u.employeeId,
          kind: u.kind,
          amountTotal: Number(u.amountTotal).toFixed(2),
          amountEmployee: Number(u.amountEmployee).toFixed(2),
          amountCompany: Number(u.amountCompany).toFixed(2),
          note: u.note,
          employee: {
            id: u.employee.id,
            name: u.employee.name,
            matricula: u.employee.matricula,
            branch: u.employee.branch,
            costCenter: u.employee.costCenter,
            admissionDate: u.employee.admissionDate,
            terminationDate: u.employee.terminationDate,
            voucherMarketExcluded: u.employee.voucherMarketExcluded,
            voucherMealExcluded: u.employee.voucherMealExcluded,
          },
        }))
        .sort((a, b) => a.employee.name.localeCompare(b.employee.name, "pt-BR")),
      totals: {
        invoiceValue: invoiceValue.toFixed(2),
        sumTotal100: sumTotal100.toFixed(2),
        sumEmployee: sumEmployee.toFixed(2),
        sumCompany: sumCompany.toFixed(2),
        diff: diff.toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao carregar invoice." });
  }
});

// PATCH /unimed/invoices/:id/usages/:employeeId
// Substitui TODOS os lançamentos do funcionário naquele mês (facilita UI e auditoria).
unimedRouter.patch("/invoices/:id/usages/:employeeId", async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const employeeId = Number(req.params.employeeId);
    if (!invoiceId || !employeeId) return res.status(400).json({ message: "Parâmetros inválidos" });

    const schema = z.object({
      usages: z.array(
        z.object({
          kind: z.enum(["PERSONAL", "WORK_ACCIDENT"]),
          amountTotal: z.union([z.string().min(1), z.number()]),
          note: z.string().optional().nullable(),
        })
      ),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });

    const invoice = await prisma.unimedInvoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
    if (!invoice) return res.status(404).json({ message: "Mês não encontrado" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    // Filtra vazios/zeros (a UI pode manter linhas em branco)
    const cleaned = parsed.data.usages
      .map((u) => ({ ...u, amountTotal: asMoneyString(u.amountTotal) }))
      .filter((u) => Number(u.amountTotal) > 0);

    await prisma.$transaction(async (tx) => {
      await tx.unimedUsage.deleteMany({ where: { invoiceId, employeeId } });
      if (cleaned.length) {
        await tx.unimedUsage.createMany({
          data: cleaned.map((u) => {
            const split = splitUnimed(u.kind, u.amountTotal);
            return {
              invoiceId,
              employeeId,
              kind: u.kind,
              amountTotal: split.amountTotal,
              amountEmployee: split.amountEmployee,
              amountCompany: split.amountCompany,
              note: u.note ? String(u.note) : null,
            };
          }),
        });
      }
    });

    return res.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || "Erro interno ao salvar valores.";
    if (String(msg).includes("Valor inválido")) return res.status(400).json({ message: msg });
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao salvar valores." });
  }
});

// POST /unimed/invoices/:id/close
unimedRouter.post("/invoices/:id/close", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.unimedInvoice.findUnique({
      where: { id },
      include: { usages: true },
    });

    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "CLOSED") return res.status(200).json({ ok: true, status: "CLOSED" });

    const invoiceValue = Number(invoice.invoiceValue);
    const sumTotal100 = invoice.usages.reduce((acc, u) => acc + Number(u.amountTotal), 0);
    const diff = Number((invoiceValue - sumTotal100).toFixed(2));

    if (Math.abs(diff) >= 0.01) {
      return res.status(400).json({
        message: "Não é possível fechar: a soma dos lançamentos (100%) não bate com a nota fiscal.",
        diff: diff.toFixed(2),
        sumTotal100: sumTotal100.toFixed(2),
        invoiceValue: invoiceValue.toFixed(2),
      });
    }

    await prisma.unimedInvoice.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    return res.json({ ok: true, status: "CLOSED" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao fechar mês." });
  }
});

// POST /unimed/invoices/:id/reopen
unimedRouter.post("/invoices/:id/reopen", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const invoice = await prisma.unimedInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) return res.status(404).json({ message: "Nota não encontrada" });
    if (invoice.status === "DRAFT") return res.json({ ok: true, status: "DRAFT" });

    await prisma.unimedInvoice.update({ where: { id }, data: { status: "DRAFT", closedAt: null } });
    return res.json({ ok: true, status: "DRAFT" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao reabrir mês." });
  }
});
