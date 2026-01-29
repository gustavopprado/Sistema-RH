import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const valeRefeicaoRouter = Router();

/**
 * "YYYY-MM" -> Date UTC (YYYY-MM-01)
 */
function parseMonthToDate(month: string): Date {
  const m = month.trim();
  const match = m.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("Formato de mês inválido. Use YYYY-MM");

  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) throw new Error("Mês inválido");

  return new Date(Date.UTC(year, mon - 1, 1));
}

function monthRange(monthStart: Date) {
  const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const end = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

function toDecimal2(value: unknown) {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(n)) throw new Error("Valor inválido");
  return new Prisma.Decimal(n).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function calcFromEmployee20(employee20: unknown) {
  const emp20 = toDecimal2(employee20);
  const total100 = emp20.mul(5).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const company80 = emp20.mul(4).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { emp20, company80, total100 };
}

/**
 * GET /vale-refeicao/:month
 * Retorna o shape que tua tela está chamando hoje.
 */
valeRefeicaoRouter.get("/:month", async (req, res) => {
  try {
    const month = req.params.month;
    const competence = parseMonthToDate(month);

    const invoice = await prisma.voucherMealInvoice.findUnique({
      where: { competence_branch: { competence, branch: "1" } },
      include: {
        allocations: {
          select: { employeeId: true, employee20: true, company80: true, total100: true },
        },
      },
    });

    if (!invoice) {
      return res.json({
        referenceMonth: month,
        period: null,
        allocations: [],
        summary: {
          invoicesTotal: "0.00",
          employeesTotal: "0.00",
          diff: "0.00",
        },
      });
    }

    const invoicesTotal = new Prisma.Decimal(invoice.invoiceSecondHalf).add(invoice.invoiceFirstHalfNext);
    const employeesTotal = invoice.allocations.reduce((acc, a) => acc.add(a.total100), new Prisma.Decimal(0));
    const diff = invoicesTotal.sub(employeesTotal);

    return res.json({
      referenceMonth: month,
      period: {
        invoiceSecondHalf: invoice.invoiceSecondHalf,
        invoiceFirstHalfNext: invoice.invoiceFirstHalfNext,
      },
      allocations: invoice.allocations,
      summary: {
        invoicesTotal,
        employeesTotal,
        diff,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || "Erro ao carregar mês." });
  }
});

/**
 * PUT /vale-refeicao/:month/invoices
 * body: { invoiceSecondHalf, invoiceFirstHalfNext }
 */
valeRefeicaoRouter.put("/:month/invoices", async (req, res) => {
  try {
    const month = req.params.month;
    const competence = parseMonthToDate(month);

    const inv2 = toDecimal2(req.body?.invoiceSecondHalf ?? 0);
    const inv1 = toDecimal2(req.body?.invoiceFirstHalfNext ?? 0);

    const { start, end } = monthRange(competence);

    // pega funcionários "no mês" (mesma lógica do voucherMarket)
    const employees = await prisma.employee.findMany({
      where: {
        admissionDate: { lte: end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
      },
      select: { id: true },
    });

    const invoice = await prisma.voucherMealInvoice.upsert({
      where: { competence_branch: { competence, branch: "1" } },
      create: {
        competence,
        branch: "1",
        invoiceSecondHalf: inv2,
        invoiceFirstHalfNext: inv1,
        status: "DRAFT",
      },
      update: {
        invoiceSecondHalf: inv2,
        invoiceFirstHalfNext: inv1,
      },
      select: { id: true, invoiceSecondHalf: true, invoiceFirstHalfNext: true },
    });

    // garante allocations pra todos funcionários do mês
    await prisma.voucherMealAllocation.createMany({
      data: employees.map((e) => ({
        invoiceId: invoice.id,
        employeeId: e.id,
        employee20: new Prisma.Decimal(0),
        company80: new Prisma.Decimal(0),
        total100: new Prisma.Decimal(0),
      })),
      skipDuplicates: true,
    });

    return res.json({
      referenceMonth: month,
      period: {
        invoiceSecondHalf: invoice.invoiceSecondHalf,
        invoiceFirstHalfNext: invoice.invoiceFirstHalfNext,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || "Erro ao salvar notas." });
  }
});

/**
 * PUT /vale-refeicao/:month/allocations
 * body: { allocations: [{ employeeId, employee20 }] }
 */
valeRefeicaoRouter.put("/:month/allocations", async (req, res) => {
  try {
    const month = req.params.month;
    const competence = parseMonthToDate(month);

    const list = req.body?.allocations;
    if (!Array.isArray(list)) return res.status(400).json({ message: "allocations deve ser um array." });

    // garante invoice
    const invoice = await prisma.voucherMealInvoice.upsert({
      where: { competence_branch: { competence, branch: "1" } },
      create: {
        competence,
        branch: "1",
        invoiceSecondHalf: new Prisma.Decimal(0),
        invoiceFirstHalfNext: new Prisma.Decimal(0),
        status: "DRAFT",
      },
      update: {},
      select: { id: true, invoiceSecondHalf: true, invoiceFirstHalfNext: true },
    });

    const ops = list.map((a: any) => {
      const employeeId = Number(a.employeeId);
      if (!employeeId) return null;

      const { emp20, company80, total100 } = calcFromEmployee20(a.employee20);

      return prisma.voucherMealAllocation.upsert({
        where: { invoiceId_employeeId: { invoiceId: invoice.id, employeeId } },
        create: {
          invoiceId: invoice.id,
          employeeId,
          employee20: emp20,
          company80,
          total100,
        },
        update: {
          employee20: emp20,
          company80,
          total100,
        },
        select: { employeeId: true, employee20: true, company80: true, total100: true },
      });
    }).filter(Boolean);

    const saved = await prisma.$transaction(ops as any);

    const invoicesTotal = new Prisma.Decimal(invoice.invoiceSecondHalf).add(invoice.invoiceFirstHalfNext);
    const employeesTotal = saved.reduce((acc: any, a: any) => acc.add(a.total100), new Prisma.Decimal(0));
    const diff = invoicesTotal.sub(employeesTotal);

    return res.json({
      referenceMonth: month,
      saved,
      summary: { invoicesTotal, employeesTotal, diff },
    });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || "Erro ao salvar allocations." });
  }
});
