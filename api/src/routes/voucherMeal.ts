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

const LINE_KINDS = [
  // Almoço (colaboradores)
  "MEAL_LUNCH",

  // Terceiros / visitantes / doação
  "MEAL_LUNCH_THIRD_PARTY",
  "MEAL_LUNCH_VISITORS",
  "MEAL_LUNCH_DONATION",

  // Café / lanches (empresa)
  "COFFEE_SANDWICH",
  "COFFEE_COFFEE_LITER",
  "COFFEE_COFFEE_MILK_LITER",
  "COFFEE_MILK_LITER",
  "SPECIAL_SERVICE",

  // Filial 02 (itens gerais)
  "COFFEE_GENERAL",
  "MISC_SODA",
  "MISC_MEAL_EVENT",
] as const;

const PARTS = ["SECOND_HALF", "FIRST_HALF_NEXT"] as const;

type LineKind = (typeof LINE_KINDS)[number];
type InvoicePart = (typeof PARTS)[number];

const LineInputSchema = z.object({
  part: z.enum(PARTS),
  kind: z.enum(LINE_KINDS),
  amount: z.union([z.string(), z.number()]),
});

function isCoffeeKind(kind: LineKind) {
  return (
    kind === "COFFEE_SANDWICH" ||
    kind === "COFFEE_COFFEE_LITER" ||
    kind === "COFFEE_COFFEE_MILK_LITER" ||
    kind === "COFFEE_MILK_LITER" ||
    kind === "SPECIAL_SERVICE" ||
    kind === "COFFEE_GENERAL" ||
    kind === "MISC_SODA" ||
    kind === "MISC_MEAL_EVENT"
  );
}

function isThirdPartyKind(kind: LineKind) {
  return (
    kind === "MEAL_LUNCH_THIRD_PARTY" || kind === "MEAL_LUNCH_VISITORS" || kind === "MEAL_LUNCH_DONATION"
  );
}

function isLunchKind(kind: LineKind) {
  return kind === "MEAL_LUNCH";
}

async function ensureDefaultLines(invoiceId: number) {
  // cria todas as linhas (part x kind) com 0.00 se não existirem
  const data = [] as Array<any>;
  for (const part of PARTS) {
    for (const kind of LINE_KINDS) {
      data.push({
        invoiceId,
        part,
        kind,
        amount: "0.00",
      });
    }
  }
  await prisma.voucherMealInvoiceLine.createMany({ data, skipDuplicates: true });
}

function sumLines(lines: Array<{ part: InvoicePart; kind: LineKind; amount: any }>) {
  const byPart: Record<InvoicePart, number> = { SECOND_HALF: 0, FIRST_HALF_NEXT: 0 };
  let lunchTotal = 0;
  let coffeeTotal = 0;
  let thirdPartyTotal = 0;

  const thirdParty = { visitors: 0, thirdParty: 0, donation: 0 };

  for (const l of lines) {
    const v = Number(l.amount);
    if (!Number.isFinite(v)) continue;
    byPart[l.part] += v;

    if (isLunchKind(l.kind)) lunchTotal += v;
    if (isCoffeeKind(l.kind)) coffeeTotal += v;
    if (isThirdPartyKind(l.kind)) {
      thirdPartyTotal += v;
      if (l.kind === "MEAL_LUNCH_VISITORS") thirdParty.visitors += v;
      if (l.kind === "MEAL_LUNCH_THIRD_PARTY") thirdParty.thirdParty += v;
      if (l.kind === "MEAL_LUNCH_DONATION") thirdParty.donation += v;
    }
  }

  const invoiceTotal = byPart.SECOND_HALF + byPart.FIRST_HALF_NEXT;
  return {
    byPart,
    invoiceTotal,
    lunchTotal,
    coffeeTotal,
    thirdPartyTotal,
    thirdParty,
  };
}

/**
 * Filtro de colaboradores para o Vale Refeição:
 * - não excluídos (voucherMealExcluded=false)
 * - filial informada (branch)
 * - trabalharam no período (admissão <= fim do mês; demissão null ou >= início)
 */
function employeesWhereForMonth(start: Date, end: Date, branch: string) {
  return {
    voucherMealExcluded: false,
    branch,
    admissionDate: { lte: end },
    OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
  } as const;
}

// GET /voucher-meal/invoices/by-month?month=YYYY-MM&branch=1|2
voucherMealRouter.get("/invoices/by-month", async (req, res) => {
  try {
    const month = String(req.query.month ?? "").trim();
    const branch = String(req.query.branch ?? "1").trim() || "1";
    if (!month) return res.status(400).json({ message: "month é obrigatório (YYYY-MM)" });

    const competence = parseMonthToDate(month);

    const invoice = await prisma.voucherMealInvoice.findUnique({
      where: { competence_branch: { competence, branch } },
      select: {
        id: true,
        competence: true,
        branch: true,
        invoiceSecondHalfNumber: true,
        invoiceFirstHalfNextNumber: true,
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
            branch: invoice.branch,
            invoiceSecondHalfNumber: invoice.invoiceSecondHalfNumber,
            invoiceFirstHalfNextNumber: invoice.invoiceFirstHalfNextNumber,
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
      branch: z.string().optional(),
      invoiceSecondHalfNumber: z.string().optional(),
      invoiceFirstHalfNextNumber: z.string().optional(),
      lines: z.array(LineInputSchema).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const competence = parseMonthToDate(parsed.data.month);
    const branch = (parsed.data.branch ?? "1").trim() || "1";
    const { start, end } = monthRange(competence);

    // funcionários que trabalharam no mês (com filtro de exclusão e filial)
    const employees = await prisma.employee.findMany({
      where: employeesWhereForMonth(start, end, branch),
      select: { id: true },
    });

    const already = await prisma.voucherMealInvoice.findUnique({
      where: { competence_branch: { competence, branch } },
      select: { id: true, status: true },
    });

    if (already) {
      if (already.status === "DRAFT") {
        // garante linhas e garante alocações (para novas admissões retroativas)
        await ensureDefaultLines(already.id);

        if (employees.length) {
          await prisma.voucherMealAllocation.createMany({
            data: employees.map((e) => ({ invoiceId: already.id, ...defaultAllocationForEmployee(e) })),
            skipDuplicates: true,
          });
        }
      }
      return res.status(200).json({ invoiceId: already.id, existed: true });
    }

    // Monta linhas iniciais (se vierem do front) ou cria defaults 0
    const provided = parsed.data.lines ?? [];
    const providedMap = new Map<string, string>();
    for (const l of provided) {
      const key = `${l.part}:${l.kind}`;
      providedMap.set(key, asMoneyString(l.amount));
    }

    const linesToCreate: Array<{ part: InvoicePart; kind: LineKind; amount: string }> = [];
    for (const part of PARTS) {
      for (const kind of LINE_KINDS) {
        const key = `${part}:${kind}`;
        linesToCreate.push({ part, kind, amount: providedMap.get(key) ?? "0.00" });
      }
    }

    // totais por nota = soma das linhas do respectivo part
    const linesForSum = linesToCreate.map((l) => ({ ...l, amount: Number(l.amount) }));
    const sums = sumLines(linesForSum as any);

    let invoiceId: number;

    try {
      const created = await prisma.voucherMealInvoice.create({
        data: {
          competence,
          branch,
          invoiceSecondHalfNumber: (parsed.data.invoiceSecondHalfNumber ?? "").trim(),
          invoiceFirstHalfNextNumber: (parsed.data.invoiceFirstHalfNextNumber ?? "").trim(),
          invoiceSecondHalf: sums.byPart.SECOND_HALF.toFixed(2),
          invoiceFirstHalfNext: sums.byPart.FIRST_HALF_NEXT.toFixed(2),
          status: "DRAFT",
          closedAt: null,
          lines: {
            createMany: {
              data: linesToCreate,
            },
          },
        },
        select: { id: true },
      });
      invoiceId = created.id;
    } catch (err: any) {
      // corrida de criação
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await prisma.voucherMealInvoice.findUnique({
          where: { competence_branch: { competence, branch } },
          select: { id: true, status: true },
        });
        if (!existing) {
          console.error("P2002 ocorreu mas não encontrei invoice pela competence.", err);
          return res.status(500).json({ message: "Falha ao criar/carregar mês." });
        }

        if (existing.status === "DRAFT") {
          await ensureDefaultLines(existing.id);
          if (employees.length) {
            await prisma.voucherMealAllocation.createMany({
              data: employees.map((e) => ({ invoiceId: existing.id, ...defaultAllocationForEmployee(e) })),
              skipDuplicates: true,
            });
          }
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

    // garante linhas default (p/ invoices antigas)
    await ensureDefaultLines(id);

    const invoice = await prisma.voucherMealInvoice.findUnique({
      where: { id },
      include: {
        lines: true,
        allocations: {
          where: {
            employee: {
              voucherMealExcluded: false,
            },
          },
          include: { employee: true },
        },
      },
    });

    if (!invoice) return res.status(404).json({ message: "Mês não encontrado" });

    const lines = invoice.lines.map((l) => ({
      id: l.id,
      part: l.part as InvoicePart,
      kind: l.kind as LineKind,
      amount: Number(l.amount).toFixed(2),
    }));

    const sums = sumLines(
      invoice.lines.map((l) => ({ part: l.part as any, kind: l.kind as any, amount: Number(l.amount) })) as any
    );

    // Atualiza totais gravados (para manter consistência com linhas)
    const storedA = Number(invoice.invoiceSecondHalf);
    const storedB = Number(invoice.invoiceFirstHalfNext);
    const shouldA = round2(sums.byPart.SECOND_HALF);
    const shouldB = round2(sums.byPart.FIRST_HALF_NEXT);
    if (round2(storedA) !== shouldA || round2(storedB) !== shouldB) {
      await prisma.voucherMealInvoice.update({
        where: { id: invoice.id },
        data: {
          invoiceSecondHalf: shouldA.toFixed(2),
          invoiceFirstHalfNext: shouldB.toFixed(2),
        },
      });
    }

    const invoiceTotal = sums.invoiceTotal;
    const lunchTotal = sums.lunchTotal;
    const coffeeTotal = sums.coffeeTotal;
    const thirdPartyTotal = sums.thirdPartyTotal;

    const sumEmployee20 = invoice.allocations.reduce((acc, a) => acc + Number(a.employee20), 0);
    const sumCompany80 = invoice.allocations.reduce((acc, a) => acc + Number(a.company80), 0);
    const sumTotal100 = invoice.allocations.reduce((acc, a) => acc + Number(a.total100), 0);

    const diffLunch = lunchTotal - sumTotal100;
    const diffInvoice = invoiceTotal - (lunchTotal + coffeeTotal + thirdPartyTotal);

    const employeesCount = invoice.allocations.length;
    const coffeePerEmployee = employeesCount > 0 ? coffeeTotal / employeesCount : 0;

    return res.json({
      invoice: {
        id: invoice.id,
        competence: invoice.competence,
        invoiceSecondHalfNumber: invoice.invoiceSecondHalfNumber,
        invoiceFirstHalfNextNumber: invoice.invoiceFirstHalfNextNumber,
        invoiceSecondHalf: shouldA.toFixed(2),
        invoiceFirstHalfNext: shouldB.toFixed(2),
        status: invoice.status,
        closedAt: invoice.closedAt,
      },
      lines,
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
      summaries: {
        notes: {
          secondHalf: shouldA.toFixed(2),
          firstHalfNext: shouldB.toFixed(2),
          total: invoiceTotal.toFixed(2),
        },
        lunch: {
          total: lunchTotal.toFixed(2),
          diffWithAllocations: diffLunch.toFixed(2),
        },
        coffee: {
          total: coffeeTotal.toFixed(2),
          perEmployee: coffeePerEmployee.toFixed(2),
          employeesCount,
        },
        thirdParty: {
          total: thirdPartyTotal.toFixed(2),
          visitors: sums.thirdParty.visitors.toFixed(2),
          thirdParty: sums.thirdParty.thirdParty.toFixed(2),
          donation: sums.thirdParty.donation.toFixed(2),
        },
        check: {
          diffInvoice: diffInvoice.toFixed(2),
        },
        allocations: {
          sumEmployee20: sumEmployee20.toFixed(2),
          sumCompany80: sumCompany80.toFixed(2),
          sumTotal100: sumTotal100.toFixed(2),
        },
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
      invoiceSecondHalfNumber: z.string().optional(),
      invoiceFirstHalfNextNumber: z.string().optional(),
      lines: z.array(LineInputSchema).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }

    const invoice = await prisma.voucherMealInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) return res.status(404).json({ message: "Mês não encontrado" });
    if (invoice.status === "CLOSED") return res.status(400).json({ message: "Mês já está fechado." });

    if (parsed.data.lines && parsed.data.lines.length) {
      // atualiza linha a linha (é pouca coisa: 18 linhas)
      for (const l of parsed.data.lines) {
        await prisma.voucherMealInvoiceLine.upsert({
          where: { invoiceId_part_kind: { invoiceId: id, part: l.part, kind: l.kind } },
          update: { amount: asMoneyString(l.amount) },
          create: { invoiceId: id, part: l.part, kind: l.kind, amount: asMoneyString(l.amount) },
        });
      }
    } else {
      await ensureDefaultLines(id);
    }

    // recalcula totais com base nas linhas
    const currentLines = await prisma.voucherMealInvoiceLine.findMany({ where: { invoiceId: id } });
    const sums = sumLines(
      currentLines.map((l) => ({ part: l.part as any, kind: l.kind as any, amount: Number(l.amount) })) as any
    );

    await prisma.voucherMealInvoice.update({
      where: { id },
      data: {
        invoiceSecondHalfNumber:
          parsed.data.invoiceSecondHalfNumber !== undefined
            ? parsed.data.invoiceSecondHalfNumber.trim()
            : undefined,
        invoiceFirstHalfNextNumber:
          parsed.data.invoiceFirstHalfNextNumber !== undefined
            ? parsed.data.invoiceFirstHalfNextNumber.trim()
            : undefined,
        invoiceSecondHalf: sums.byPart.SECOND_HALF.toFixed(2),
        invoiceFirstHalfNext: sums.byPart.FIRST_HALF_NEXT.toFixed(2),
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
