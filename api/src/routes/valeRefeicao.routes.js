// api/src/routes/valeRefeicao.routes.js
const express = require("express");
const { PrismaClient, Prisma } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

function assertMonth(ref) {
  if (!/^\d{4}-\d{2}$/.test(ref)) {
    const err = new Error("referenceMonth inválido. Use YYYY-MM.");
    err.status = 400;
    throw err;
  }
}

function toDecimal2(value) {
  // aceita number ou string
  const d = new Prisma.Decimal(value || 0);
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function calcFromEmployee20(employee20) {
  // employee20 = 20% => total100 = employee20 / 0.2 = employee20 * 5
  const emp20 = toDecimal2(employee20);
  const total100 = emp20.mul(5).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const company80 = total100.mul(0.8).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { emp20, company80, total100 };
}

/**
 * GET /vale-refeicao/:referenceMonth
 * Retorna:
 * - notas (invoiceSecondHalf, invoiceFirstHalfNext)
 * - allocations (por employeeId)
 * - resumo (soma e diferença)
 */
router.get("/:referenceMonth", async (req, res, next) => {
  try {
    const referenceMonth = req.params.referenceMonth;
    assertMonth(referenceMonth);

    const period = await prisma.mealPeriod.findUnique({
      where: { referenceMonth },
      include: {
        allocations: {
          select: {
            employeeId: true,
            employee20: true,
            company80: true,
            total100: true,
          },
        },
      },
    });

    const invoicesTotal = period
      ? new Prisma.Decimal(period.invoiceSecondHalf).add(period.invoiceFirstHalfNext)
      : new Prisma.Decimal(0);

    const employeesTotal = period
      ? period.allocations.reduce(
          (acc, a) => acc.add(a.total100),
          new Prisma.Decimal(0)
        )
      : new Prisma.Decimal(0);

    const diff = invoicesTotal.sub(employeesTotal);

    res.json({
      referenceMonth,
      period: period
        ? {
            invoiceSecondHalf: period.invoiceSecondHalf,
            invoiceFirstHalfNext: period.invoiceFirstHalfNext,
          }
        : null,
      allocations: period ? period.allocations : [],
      summary: {
        invoicesTotal,
        employeesTotal,
        diff, // 0 => bateu
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /vale-refeicao/:referenceMonth/invoices
 * body: { invoiceSecondHalf, invoiceFirstHalfNext }
 */
router.put("/:referenceMonth/invoices", async (req, res, next) => {
  try {
    const referenceMonth = req.params.referenceMonth;
    assertMonth(referenceMonth);

    const { invoiceSecondHalf, invoiceFirstHalfNext } = req.body || {};

    const inv2 = toDecimal2(invoiceSecondHalf);
    const inv1 = toDecimal2(invoiceFirstHalfNext);

    const period = await prisma.mealPeriod.upsert({
      where: { referenceMonth },
      create: {
        referenceMonth,
        invoiceSecondHalf: inv2,
        invoiceFirstHalfNext: inv1,
      },
      update: {
        invoiceSecondHalf: inv2,
        invoiceFirstHalfNext: inv1,
      },
      select: {
        referenceMonth: true,
        invoiceSecondHalf: true,
        invoiceFirstHalfNext: true,
      },
    });

    res.json(period);
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /vale-refeicao/:referenceMonth/allocations
 * body: { allocations: [{ employeeId, employee20 }] }
 *
 * Recalcula automaticamente 80% e 100%:
 * total100 = employee20 * 5
 * company80 = employee20 * 4
 */
router.put("/:referenceMonth/allocations", async (req, res, next) => {
  try {
    const referenceMonth = req.params.referenceMonth;
    assertMonth(referenceMonth);

    const { allocations } = req.body || {};
    if (!Array.isArray(allocations)) {
      return res.status(400).json({ error: "allocations deve ser um array." });
    }

    // garante que exista period
    const period = await prisma.mealPeriod.upsert({
      where: { referenceMonth },
      create: {
        referenceMonth,
        invoiceSecondHalf: toDecimal2(0),
        invoiceFirstHalfNext: toDecimal2(0),
      },
      update: {},
      select: { id: true, invoiceSecondHalf: true, invoiceFirstHalfNext: true },
    });

    const ops = allocations.map((a) => {
      const employeeId = Number(a.employeeId);
      if (!employeeId) return null;

      const { emp20, company80, total100 } = calcFromEmployee20(a.employee20);

      return prisma.mealAllocation.upsert({
        where: {
          periodId_employeeId: {
            periodId: period.id,
            employeeId,
          },
        },
        create: {
          periodId: period.id,
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
        select: {
          employeeId: true,
          employee20: true,
          company80: true,
          total100: true,
        },
      });
    }).filter(Boolean);

    const saved = await prisma.$transaction(ops);

    // resumo
    const invoicesTotal = new Prisma.Decimal(period.invoiceSecondHalf).add(period.invoiceFirstHalfNext);
    const employeesTotal = saved.reduce((acc, a) => acc.add(a.total100), new Prisma.Decimal(0));
    const diff = invoicesTotal.sub(employeesTotal);

    res.json({
      referenceMonth,
      saved,
      summary: { invoicesTotal, employeesTotal, diff },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
