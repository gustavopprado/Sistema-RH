import { Router } from "express";
import { prisma } from "../lib/prisma";

export const reportsRouter = Router();

/**
 * Converte "YYYY-MM" -> 1º dia do mês em UTC (Date.UTC)
 * Evita variações de fuso ao comparar @db.Date.
 */
function parseMonthToDate(month: string): Date {
  const m = String(month ?? "").trim();
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

function monthKeyUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const PROVIDER_LABEL: Record<string, string> = {
  LABORATORIO_SANTA_CRUZ: "Laboratório Santa Cruz",
  CENTRO_DIAGNOSTICO_CAPAO_RASO: "Centro de Diagnóstico Capão Raso",
  POLICLINICA_CAPAO_RASO: "Policlínica Capão Raso",
  POLICLINICA_MANSUR: "Policlínica Mansur",
};

function moneyToFixed2(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

type MonthBucket = {
  month: string;
  monthly: null | {
    invoiceId: number;
    competence: Date;
    invoiceNumber: string;
    invoiceValue: string;
    unitValue: string;
    status: string;
    closedAt: Date | null;
    dependents: number;
    lives: number;
    amountTotal: string;
    amountCompany: string; // 100% empresa
    amountEmployee: string; // sempre 0
  };
  unimedUsages: Array<{
    id: number;
    invoiceId: number;
    competence: Date;
    invoiceNumber: string;
    kind: "PERSONAL" | "WORK_ACCIDENT";
    amountTotal: string;
    amountCompany: string;
    amountEmployee: string;
    note: string | null;
  }>;
  convenios: Array<{
    id: number;
    invoiceId: number;
    competence: Date;
    provider: string;
    providerLabel: string;
    invoiceNumber: string;
    kind: "PERSONAL" | "WORK_ACCIDENT";
    amountTotal: string;
    amountCompany: string;
    amountEmployee: string;
    note: string | null;
  }>;
  totals: {
    company: string;
    employee: string;
    gross: string;
  };
};

type HealthByMonthItem = {
  employee: {
    id: number;
    name: string;
    matricula: string;
    branch: string;
    costCenter: string;
  };
  monthlyCompany: string; // Unimed Mensalidade (100% empresa)
  unimedCompany: string; // Unimed Procedimentos (parte empresa)
  conveniosCompany: string; // Convênios Procedimentos (parte empresa)
  totalCompany: string; // Soma das 3 linhas
};

// GET /reports/health/by-month?month=YYYY-MM
// Lista TODOS os funcionários do mês e os valores que a empresa arca (saúde), resumidamente.
reportsRouter.get("/health/by-month", async (req, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    if (!month) return res.status(400).json({ message: "month é obrigatório (YYYY-MM)" });

    let competence: Date;
    try {
      competence = parseMonthToDate(month);
    } catch (e: any) {
      return res.status(400).json({ message: e?.message || "Mês inválido" });
    }

    const { start, end } = monthRange(competence);

    // Funcionários ativos em algum momento do mês (admissão <= fim do mês e (sem demissão ou demissão >= início do mês))
    const employees = await prisma.employee.findMany({
      where: {
        admissionDate: { lte: end },
        OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        matricula: true,
        branch: true,
        costCenter: true,
      },
    });

    const [monthlySums, unimedSums, convenioSums] = await Promise.all([
      prisma.unimedMonthlyAllocation.groupBy({
        by: ["employeeId"],
        where: { invoice: { competence } },
        _sum: { amountTotal: true },
      }),
      prisma.unimedUsage.groupBy({
        by: ["employeeId"],
        where: { invoice: { competence } },
        _sum: { amountCompany: true },
      }),
      prisma.medicalConvenioUsage.groupBy({
        by: ["employeeId"],
        where: { invoice: { competence } },
        _sum: { amountCompany: true },
      }),
    ]);

    const monthlyMap = new Map<number, number>();
    for (const r of monthlySums) monthlyMap.set(r.employeeId, Number(r._sum.amountTotal ?? 0));

    const unimedMap = new Map<number, number>();
    for (const r of unimedSums) unimedMap.set(r.employeeId, Number(r._sum.amountCompany ?? 0));

    const convenioMap = new Map<number, number>();
    for (const r of convenioSums) convenioMap.set(r.employeeId, Number(r._sum.amountCompany ?? 0));

    const items: HealthByMonthItem[] = employees.map((e) => {
      const monthly = monthlyMap.get(e.id) ?? 0;
      const unimed = unimedMap.get(e.id) ?? 0;
      const convenios = convenioMap.get(e.id) ?? 0;
      const total = monthly + unimed + convenios;
      return {
        employee: e,
        monthlyCompany: monthly.toFixed(2),
        unimedCompany: unimed.toFixed(2),
        conveniosCompany: convenios.toFixed(2),
        totalCompany: total.toFixed(2),
      };
    });

    // totais do mês (empresa)
    const totals = items.reduce(
      (acc, it) => {
        acc.monthly += Number(it.monthlyCompany) || 0;
        acc.unimed += Number(it.unimedCompany) || 0;
        acc.convenios += Number(it.conveniosCompany) || 0;
        acc.total += Number(it.totalCompany) || 0;
        return acc;
      },
      { monthly: 0, unimed: 0, convenios: 0, total: 0 }
    );

    return res.json({
      month,
      items,
      totals: {
        monthlyCompany: totals.monthly.toFixed(2),
        unimedCompany: totals.unimed.toFixed(2),
        conveniosCompany: totals.convenios.toFixed(2),
        totalCompany: totals.total.toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao gerar relatório." });
  }
});

// GET /reports/health/detail?employeeId=123&month=YYYY-MM
// Detalha os valores do funcionário em uma competência específica.
reportsRouter.get("/health/detail", async (req, res) => {
  try {
    const employeeId = Number(req.query.employeeId);
    const month = String(req.query.month ?? "").trim();
    if (!employeeId) return res.status(400).json({ message: "employeeId é obrigatório" });
    if (!month) return res.status(400).json({ message: "month é obrigatório (YYYY-MM)" });

    let competence: Date;
    try {
      competence = parseMonthToDate(month);
    } catch (e: any) {
      return res.status(400).json({ message: e?.message || "Mês inválido" });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

    const [monthlyAlloc, unimedUsages, convenioUsages] = await Promise.all([
      prisma.unimedMonthlyAllocation.findFirst({
        where: { employeeId, invoice: { competence } },
        include: {
          invoice: {
            select: {
              id: true,
              competence: true,
              invoiceNumber: true,
              invoiceValue: true,
              unitValue: true,
              status: true,
              closedAt: true,
            },
          },
        },
      }),
      prisma.unimedUsage.findMany({
        where: { employeeId, invoice: { competence } },
        include: {
          invoice: {
            select: {
              id: true,
              competence: true,
              invoiceNumber: true,
            },
          },
        },
      }),
      prisma.medicalConvenioUsage.findMany({
        where: { employeeId, invoice: { competence } },
        include: {
          invoice: {
            select: {
              id: true,
              competence: true,
              provider: true,
              invoiceNumber: true,
            },
          },
        },
      }),
    ]);

    const bucket: MonthBucket = {
      month,
      monthly: null,
      unimedUsages: [],
      convenios: [],
      totals: { company: "0.00", employee: "0.00", gross: "0.00" },
    };

    // Unimed Mensalidade (100% empresa)
    if (monthlyAlloc) {
      const dependents = monthlyAlloc.dependents ?? 0;
      const lives = dependents + 1;
      const amountTotal = moneyToFixed2(monthlyAlloc.amountTotal);
      bucket.monthly = {
        invoiceId: monthlyAlloc.invoice.id,
        competence: monthlyAlloc.invoice.competence,
        invoiceNumber: monthlyAlloc.invoice.invoiceNumber,
        invoiceValue: moneyToFixed2(monthlyAlloc.invoice.invoiceValue),
        unitValue: moneyToFixed2(monthlyAlloc.invoice.unitValue),
        status: String(monthlyAlloc.invoice.status),
        closedAt: monthlyAlloc.invoice.closedAt,
        dependents,
        lives,
        amountTotal,
        amountCompany: amountTotal,
        amountEmployee: "0.00",
      };
    }

    // Unimed (procedimentos)
    for (const u of unimedUsages) {
      bucket.unimedUsages.push({
        id: u.id,
        invoiceId: u.invoice.id,
        competence: u.invoice.competence,
        invoiceNumber: u.invoice.invoiceNumber,
        kind: u.kind,
        amountTotal: moneyToFixed2(u.amountTotal),
        amountCompany: moneyToFixed2(u.amountCompany),
        amountEmployee: moneyToFixed2(u.amountEmployee),
        note: u.note ?? null,
      });
    }

    // Convênios (procedimentos)
    for (const u of convenioUsages) {
      const provider = String(u.invoice.provider);
      bucket.convenios.push({
        id: u.id,
        invoiceId: u.invoice.id,
        competence: u.invoice.competence,
        provider,
        providerLabel: PROVIDER_LABEL[provider] ?? provider,
        invoiceNumber: u.invoice.invoiceNumber,
        kind: u.kind,
        amountTotal: moneyToFixed2(u.amountTotal),
        amountCompany: moneyToFixed2(u.amountCompany),
        amountEmployee: moneyToFixed2(u.amountEmployee),
        note: u.note ?? null,
      });
    }

    // Totais
    let comp = 0;
    let emp = 0;
    let gross = 0;

    if (bucket.monthly) {
      const v = Number(bucket.monthly.amountTotal) || 0;
      gross += v;
      comp += v;
    }

    for (const u of bucket.unimedUsages) {
      gross += Number(u.amountTotal) || 0;
      comp += Number(u.amountCompany) || 0;
      emp += Number(u.amountEmployee) || 0;
    }

    for (const u of bucket.convenios) {
      gross += Number(u.amountTotal) || 0;
      comp += Number(u.amountCompany) || 0;
      emp += Number(u.amountEmployee) || 0;
    }

    bucket.totals = {
      company: comp.toFixed(2),
      employee: emp.toFixed(2),
      gross: gross.toFixed(2),
    };

    bucket.unimedUsages.sort((a, z) => a.id - z.id);
    bucket.convenios.sort((a, z) => a.providerLabel.localeCompare(z.providerLabel, "pt-BR"));

    return res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        matricula: employee.matricula,
        branch: employee.branch,
        costCenter: employee.costCenter,
        admissionDate: employee.admissionDate,
        terminationDate: employee.terminationDate,
      },
      months: [bucket],
      totals: bucket.totals,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao gerar relatório." });
  }
});

// GET /reports/health?employeeId=123
// Consolida: Unimed (procedimentos) + Convênios médicos (procedimentos) + Unimed Mensalidade (100% empresa)
reportsRouter.get("/health", async (req, res) => {
  try {
    const employeeId = Number(req.query.employeeId);
    if (!employeeId) return res.status(400).json({ message: "employeeId é obrigatório" });

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

    const [monthlyAllocs, unimedUsages, convenioUsages] = await Promise.all([
      prisma.unimedMonthlyAllocation.findMany({
        where: { employeeId },
        include: {
          invoice: {
            select: {
              id: true,
              competence: true,
              invoiceNumber: true,
              invoiceValue: true,
              unitValue: true,
              status: true,
              closedAt: true,
            },
          },
        },
      }),
      prisma.unimedUsage.findMany({
        where: { employeeId },
        include: {
          invoice: {
            select: {
              id: true,
              competence: true,
              invoiceNumber: true,
            },
          },
        },
      }),
      prisma.medicalConvenioUsage.findMany({
        where: { employeeId },
        include: {
          invoice: {
            select: {
              id: true,
              competence: true,
              provider: true,
              invoiceNumber: true,
            },
          },
        },
      }),
    ]);

    const buckets = new Map<string, MonthBucket>();

    function getBucket(month: string): MonthBucket {
      const existing = buckets.get(month);
      if (existing) return existing;
      const created: MonthBucket = {
        month,
        monthly: null,
        unimedUsages: [],
        convenios: [],
        totals: { company: "0.00", employee: "0.00", gross: "0.00" },
      };
      buckets.set(month, created);
      return created;
    }

    // Unimed Mensalidade (100% empresa)
    for (const a of monthlyAllocs) {
      const month = monthKeyUTC(a.invoice.competence);
      const b = getBucket(month);
      const dependents = a.dependents ?? 0;
      const lives = dependents + 1;
      const amountTotal = moneyToFixed2(a.amountTotal);
      b.monthly = {
        invoiceId: a.invoice.id,
        competence: a.invoice.competence,
        invoiceNumber: a.invoice.invoiceNumber,
        invoiceValue: moneyToFixed2(a.invoice.invoiceValue),
        unitValue: moneyToFixed2(a.invoice.unitValue),
        status: String(a.invoice.status),
        closedAt: a.invoice.closedAt,
        dependents,
        lives,
        amountTotal,
        amountCompany: amountTotal,
        amountEmployee: "0.00",
      };
    }

    // Unimed (procedimentos)
    for (const u of unimedUsages) {
      const month = monthKeyUTC(u.invoice.competence);
      const b = getBucket(month);
      b.unimedUsages.push({
        id: u.id,
        invoiceId: u.invoice.id,
        competence: u.invoice.competence,
        invoiceNumber: u.invoice.invoiceNumber,
        kind: u.kind,
        amountTotal: moneyToFixed2(u.amountTotal),
        amountCompany: moneyToFixed2(u.amountCompany),
        amountEmployee: moneyToFixed2(u.amountEmployee),
        note: u.note ?? null,
      });
    }

    // Convênios (procedimentos)
    for (const u of convenioUsages) {
      const month = monthKeyUTC(u.invoice.competence);
      const b = getBucket(month);
      const provider = String(u.invoice.provider);
      b.convenios.push({
        id: u.id,
        invoiceId: u.invoice.id,
        competence: u.invoice.competence,
        provider,
        providerLabel: PROVIDER_LABEL[provider] ?? provider,
        invoiceNumber: u.invoice.invoiceNumber,
        kind: u.kind,
        amountTotal: moneyToFixed2(u.amountTotal),
        amountCompany: moneyToFixed2(u.amountCompany),
        amountEmployee: moneyToFixed2(u.amountEmployee),
        note: u.note ?? null,
      });
    }

    // calcula totais por mês
    for (const b of buckets.values()) {
      let comp = 0;
      let emp = 0;
      let gross = 0;

      if (b.monthly) {
        const v = Number(b.monthly.amountTotal) || 0;
        gross += v;
        comp += v; // 100% empresa
      }

      for (const u of b.unimedUsages) {
        gross += Number(u.amountTotal) || 0;
        comp += Number(u.amountCompany) || 0;
        emp += Number(u.amountEmployee) || 0;
      }

      for (const u of b.convenios) {
        gross += Number(u.amountTotal) || 0;
        comp += Number(u.amountCompany) || 0;
        emp += Number(u.amountEmployee) || 0;
      }

      b.totals = {
        company: comp.toFixed(2),
        employee: emp.toFixed(2),
        gross: gross.toFixed(2),
      };

      b.unimedUsages.sort((a, z) => a.id - z.id);
      b.convenios.sort((a, z) => a.providerLabel.localeCompare(z.providerLabel, "pt-BR"));
    }

    const months = Array.from(buckets.values()).sort((a, b) => b.month.localeCompare(a.month));

    const totals = months.reduce(
      (acc, m) => {
        acc.company += Number(m.totals.company) || 0;
        acc.employee += Number(m.totals.employee) || 0;
        acc.gross += Number(m.totals.gross) || 0;
        return acc;
      },
      { company: 0, employee: 0, gross: 0 }
    );

    return res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        matricula: employee.matricula,
        branch: employee.branch,
        costCenter: employee.costCenter,
        admissionDate: employee.admissionDate,
        terminationDate: employee.terminationDate,
      },
      months,
      totals: {
        company: totals.company.toFixed(2),
        employee: totals.employee.toFixed(2),
        gross: totals.gross.toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao gerar relatório." });
  }
});
