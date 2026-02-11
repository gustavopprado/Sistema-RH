import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  VoucherMealAllocation,
  VoucherMealInvoice,
  VoucherMealInvoiceDetails,
  VoucherMealInvoicePart,
  VoucherMealLineKind,
} from "../api";

function moneyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function monthNow(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function clamp2(n: number): number {
  return Math.round(n * 100) / 100;
}

type LineMap = Record<VoucherMealLineKind, Record<VoucherMealInvoicePart, string>>;

const ALL_KINDS: VoucherMealLineKind[] = [
  "MEAL_LUNCH",
  "COFFEE_SANDWICH",
  "COFFEE_COFFEE_LITER",
  "COFFEE_COFFEE_MILK_LITER",
  "COFFEE_MILK_LITER",
  "SPECIAL_SERVICE",
  "MEAL_LUNCH_VISITORS",
  "MEAL_LUNCH_THIRD_PARTY",
  "MEAL_LUNCH_DONATION",
];

const PARTS: VoucherMealInvoicePart[] = ["SECOND_HALF", "FIRST_HALF_NEXT"];

const LABEL: Record<VoucherMealLineKind, string> = {
  MEAL_LUNCH: "Refeição almoço (colaboradores)",
  COFFEE_SANDWICH: "Sanduíche",
  COFFEE_COFFEE_LITER: "Café litro",
  COFFEE_COFFEE_MILK_LITER: "Café com leite litro",
  COFFEE_MILK_LITER: "Leite litro",
  SPECIAL_SERVICE: "Atendimento especial",
  MEAL_LUNCH_VISITORS: "Refeição almoço visitantes",
  MEAL_LUNCH_THIRD_PARTY: "Refeição almoço terceiros",
  MEAL_LUNCH_DONATION: "Refeição almoço doação",

  // Filial 02 (não usado aqui, mas necessário para o tipo)
  COFFEE_GENERAL: "Café (geral)",
  MISC_SODA: "Diversos (refrigerante)",
  MISC_MEAL_EVENT: "Diversos (refeição evento)",
};

const GROUPS: Array<{
  title: string;
  hint: string;
  kinds: VoucherMealLineKind[];
  tone: "meal" | "coffee" | "third";
}> = [
  {
    title: "Almoço",
    hint: "Esse valor (somado das duas notas) deve bater com a soma (100%) dos funcionários.",
    kinds: ["MEAL_LUNCH"],
    tone: "meal",
  },
  {
    title: "Café",
    hint: "Esses valores (somados das duas notas) serão rateados igualmente entre os colaboradores listados (custo 100% empresa).",
    kinds: [
      "COFFEE_SANDWICH",
      "COFFEE_COFFEE_LITER",
      "COFFEE_COFFEE_MILK_LITER",
      "COFFEE_MILK_LITER",
      "SPECIAL_SERVICE",
    ],
    tone: "coffee",
  },
  {
    title: "Terceiros",
    hint: "Apenas para relatório/organização (não entra no rateio dos colaboradores).",
    kinds: ["MEAL_LUNCH_VISITORS", "MEAL_LUNCH_THIRD_PARTY", "MEAL_LUNCH_DONATION"],
    tone: "third",
  },
];

function emptyLineMap(): LineMap {
  const m: any = {};
  for (const k of ALL_KINDS) {
    m[k] = { SECOND_HALF: "0.00", FIRST_HALF_NEXT: "0.00" };
  }
  return m as LineMap;
}

function toneStyle(tone: "meal" | "coffee" | "third") {
  if (tone === "meal") return { borderColor: "#cfe7c3", background: "#f6fff2" };
  if (tone === "coffee") return { borderColor: "#d9dbe8", background: "#f7f8ff" };
  return { borderColor: "#f3d4b2", background: "#fff8f0" };
}

export default function ValeRefeicaoPage() {
  const [month, setMonth] = useState<string>(() => monthNow());
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [invoice, setInvoice] = useState<VoucherMealInvoice | null>(null);
  const [allocations, setAllocations] = useState<VoucherMealAllocation[]>([]);

  const [lines, setLines] = useState<LineMap>(() => emptyLineMap());
  const [invoiceSecondHalfNumber, setInvoiceSecondHalfNumber] = useState<string>("");
  const [invoiceFirstHalfNextNumber, setInvoiceFirstHalfNextNumber] = useState<string>("");

  const [onlyFilled, setOnlyFilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // ✅ PASSO 3: filtro por centro de custo
  const [costCenterFilter, setCostCenterFilter] = useState<string>("ALL");

  // debounce por funcionário
  const timers = useRef<Record<number, any>>({});

  const isClosed = invoice?.status === "CLOSED";

  // ==========================
  // 1) TOTAIS DINÂMICOS (NOTAS)
  // ==========================
  const computed = useMemo(() => {
    // Totais por nota (somando TODOS os itens daquela parte)
    let noteSecondHalf = 0;
    let noteFirstHalf = 0;

    // Totais por grupo
    let lunchSecondHalf = 0;
    let lunchFirstHalf = 0;

    let coffeeSecondHalf = 0;
    let coffeeFirstHalf = 0;

    let thirdSecondHalf = 0;
    let thirdFirstHalf = 0;

    // Terceiros por tipo (somado das duas)
    let thirdVisitors = 0;
    let thirdThirdParty = 0;
    let thirdDonation = 0;

    for (const kind of ALL_KINDS) {
      const a = num(lines[kind]?.SECOND_HALF);
      const b = num(lines[kind]?.FIRST_HALF_NEXT);

      noteSecondHalf += a;
      noteFirstHalf += b;

      if (kind === "MEAL_LUNCH") {
        lunchSecondHalf += a;
        lunchFirstHalf += b;
      }

      if (
        kind === "COFFEE_SANDWICH" ||
        kind === "COFFEE_COFFEE_LITER" ||
        kind === "COFFEE_COFFEE_MILK_LITER" ||
        kind === "COFFEE_MILK_LITER" ||
        kind === "SPECIAL_SERVICE"
      ) {
        coffeeSecondHalf += a;
        coffeeFirstHalf += b;
      }

      if (kind === "MEAL_LUNCH_VISITORS" || kind === "MEAL_LUNCH_THIRD_PARTY" || kind === "MEAL_LUNCH_DONATION") {
        thirdSecondHalf += a;
        thirdFirstHalf += b;

        const tot = a + b;
        if (kind === "MEAL_LUNCH_VISITORS") thirdVisitors += tot;
        if (kind === "MEAL_LUNCH_THIRD_PARTY") thirdThirdParty += tot;
        if (kind === "MEAL_LUNCH_DONATION") thirdDonation += tot;
      }
    }

    noteSecondHalf = clamp2(noteSecondHalf);
    noteFirstHalf = clamp2(noteFirstHalf);

    lunchSecondHalf = clamp2(lunchSecondHalf);
    lunchFirstHalf = clamp2(lunchFirstHalf);

    coffeeSecondHalf = clamp2(coffeeSecondHalf);
    coffeeFirstHalf = clamp2(coffeeFirstHalf);

    thirdSecondHalf = clamp2(thirdSecondHalf);
    thirdFirstHalf = clamp2(thirdFirstHalf);

    const invoiceTotal = clamp2(noteSecondHalf + noteFirstHalf);

    const lunchTotal = clamp2(lunchSecondHalf + lunchFirstHalf);
    const coffeeTotal = clamp2(coffeeSecondHalf + coffeeFirstHalf);
    const thirdPartyTotal = clamp2(thirdSecondHalf + thirdFirstHalf);

    return {
      notes: {
        secondHalf: noteSecondHalf,
        firstHalfNext: noteFirstHalf,
        total: invoiceTotal,
      },
      lunchTotal,
      coffeeTotal,
      thirdPartyTotal,
      groupTotalsByPart: {
        lunch: { secondHalf: lunchSecondHalf, firstHalfNext: lunchFirstHalf },
        coffee: { secondHalf: coffeeSecondHalf, firstHalfNext: coffeeFirstHalf },
        third: { secondHalf: thirdSecondHalf, firstHalfNext: thirdFirstHalf },
      },
      thirdPartyByKind: {
        VISITORS: clamp2(thirdVisitors),
        THIRD_PARTY: clamp2(thirdThirdParty),
        DONATION: clamp2(thirdDonation),
      },
    };
  }, [lines]);

  // ==========================================
  // 2) LINHAS / PAYLOAD (SALVAMENTO NO BACKEND)
  // ==========================================
  function updateLine(kind: VoucherMealLineKind, part: VoucherMealInvoicePart, value: string) {
    setLines((prev) => ({ ...prev, [kind]: { ...prev[kind], [part]: value } }));
  }

  function buildLinesPayload() {
    return ALL_KINDS.flatMap((kind) =>
      PARTS.map((part) => ({
        kind,
        part,
        amount: clamp2(num(lines[kind][part])).toFixed(2),
      }))
    );
  }

  // ==========================
  // 3) FUNCIONÁRIOS DINÂMICOS
  // ==========================
  function calcFromEmployee20(employee20: number) {
    const e20 = clamp2(employee20);
    const company80 = clamp2(e20 * 4);
    const total100 = clamp2(e20 * 5);
    return { employee20: e20, company80, total100 };
  }

  const derivedAllocations = useMemo(() => {
    return allocations.map((a) => {
      const e20 = num(a.employee20);
      const calc = calcFromEmployee20(e20);
      const filled = calc.employee20 > 0;
      return {
        ...a,
        employee20Num: calc.employee20,
        company80Num: calc.company80,
        total100Num: calc.total100,
        filled,
      } as any;
    });
  }, [allocations]);

  const rows = useMemo(() => {
    return onlyFilled ? derivedAllocations.filter((x: any) => x.filled) : derivedAllocations;
  }, [derivedAllocations, onlyFilled]);

  const allocTotals = useMemo(() => {
    const sumEmployee20 = clamp2(derivedAllocations.reduce((acc: number, a: any) => acc + a.employee20Num, 0));
    const sumCompany80 = clamp2(derivedAllocations.reduce((acc: number, a: any) => acc + a.company80Num, 0));
    const sumTotal100 = clamp2(derivedAllocations.reduce((acc: number, a: any) => acc + a.total100Num, 0));

    const diffLunch = clamp2(computed.lunchTotal - sumTotal100);

    return { sumEmployee20, sumCompany80, sumTotal100, diffLunch };
  }, [derivedAllocations, computed.lunchTotal]);

  // ✅ lista de centros (para o select do passo 3)
  const costCenters = useMemo(() => {
    const set = new Set<string>();
    derivedAllocations.forEach((a: any) => set.add(String(a.employee?.costCenter || "").trim()));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [derivedAllocations]);

  // ✅ alocações filtradas por centro (apenas passo 3)
  const filteredDerivedAllocations = useMemo(() => {
    if (costCenterFilter === "ALL") return derivedAllocations;
    return derivedAllocations.filter((a: any) => String(a.employee?.costCenter) === costCenterFilter);
  }, [derivedAllocations, costCenterFilter]);

  // ✅ totais do resumo final considerando filtro (almoço vem da folha/lançamento)
  const finalTotals = useMemo(() => {
    const sumEmployee20 = clamp2(filteredDerivedAllocations.reduce((acc: number, a: any) => acc + a.employee20Num, 0));
    const sumCompany80 = clamp2(filteredDerivedAllocations.reduce((acc: number, a: any) => acc + a.company80Num, 0));
    const sumTotal100 = clamp2(filteredDerivedAllocations.reduce((acc: number, a: any) => acc + a.total100Num, 0));
    return { sumEmployee20, sumCompany80, sumTotal100 };
  }, [filteredDerivedAllocations]);

  const employeeCountAll = allocations.length;
  const employeeCountFiltered = filteredDerivedAllocations.length;

  const coffeePerEmployee = useMemo(() => {
    if (!employeeCountAll) return 0;
    return clamp2(computed.coffeeTotal / employeeCountAll);
  }, [computed.coffeeTotal, employeeCountAll]);

  // ✅ café por colaborador no resumo final (considera filtro)
  const coffeePerEmployeeFiltered = useMemo(() => {
    if (!employeeCountFiltered) return 0;
    return clamp2(computed.coffeeTotal / employeeCountFiltered);
  }, [computed.coffeeTotal, employeeCountFiltered]);

  const companyTotalWithCoffee = useMemo(() => {
    // Café é 100% empresa, então soma direto no total da empresa (geral)
    return clamp2(allocTotals.sumCompany80 + computed.coffeeTotal);
  }, [allocTotals.sumCompany80, computed.coffeeTotal]);

  // ✅ total empresa no resumo final (considera filtro)
  const companyTotalWithCoffeeFiltered = useMemo(() => {
    return clamp2(finalTotals.sumCompany80 + computed.coffeeTotal);
  }, [finalTotals.sumCompany80, computed.coffeeTotal]);

  // ==========================
  // 4) LOAD / SAVE (BACKEND)
  // ==========================
  async function loadInvoiceDetails(id: number) {
    const { data } = await api.get<VoucherMealInvoiceDetails>(`/voucher-meal/invoices/${id}`);

    setInvoice(data.invoice);
    setAllocations(data.allocations);

    // linhas vindas do backend
    const m = emptyLineMap();
    for (const l of data.lines) {
      if (m[l.kind]) m[l.kind][l.part] = String(l.amount);
    }
    setLines(m);

    setInvoiceSecondHalfNumber((data.invoice as any).invoiceSecondHalfNumber || "");
    setInvoiceFirstHalfNextNumber((data.invoice as any).invoiceFirstHalfNextNumber || "");
  }

  async function loadByMonth() {
    setError("");
    setSaving(true);
    try {
      const { data } = await api.get<{ invoice: VoucherMealInvoice | null }>("/voucher-meal/invoices/by-month", {
        params: { month },
      });

      if (!data.invoice) {
        setInvoice(null);
        setAllocations([]);
        setLines(emptyLineMap());
        setInvoiceSecondHalfNumber("");
        setInvoiceFirstHalfNextNumber("");
        setStep(1);
        setCostCenterFilter("ALL");
        return;
      }

      await loadInvoiceDetails(data.invoice.id);
      setStep(1);
      setCostCenterFilter("ALL");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao carregar mês.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadByMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function createMonth() {
    setError("");
    setSaving(true);
    try {
      const { data } = await api.post<{ invoiceId: number; existed: boolean }>("/voucher-meal/invoices", {
        month,
        invoiceSecondHalfNumber: invoiceSecondHalfNumber.trim(),
        invoiceFirstHalfNextNumber: invoiceFirstHalfNextNumber.trim(),
        lines: buildLinesPayload(),
      });

      await loadInvoiceDetails(data.invoiceId);
      if (data.existed) setError("Este mês já existe e foi carregado.");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao criar o mês.");
    } finally {
      setSaving(false);
    }
  }

  async function saveStep1() {
    if (!invoice) return createMonth();
    if (isClosed) return setError("Mês já está fechado.");

    setSaving(true);
    setError("");
    try {
      await api.patch(`/voucher-meal/invoices/${invoice.id}`, {
        invoiceSecondHalfNumber: invoiceSecondHalfNumber.trim(),
        invoiceFirstHalfNextNumber: invoiceFirstHalfNextNumber.trim(),
        lines: buildLinesPayload(),
      });
      await loadInvoiceDetails(invoice.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao salvar valores.");
    } finally {
      setSaving(false);
    }
  }

  function updateLocal(employeeId: number, employee20: string) {
    setAllocations((prev) => prev.map((a) => (a.employeeId === employeeId ? ({ ...a, employee20 } as any) : a)));
  }

  function scheduleSaveAllocation(employeeId: number, employee20Str: string) {
    if (!invoice) return;
    if (isClosed) return;

    if (timers.current[employeeId]) clearTimeout(timers.current[employeeId]);

    timers.current[employeeId] = setTimeout(async () => {
      try {
        await api.patch(`/voucher-meal/invoices/${invoice.id}/allocations/${employeeId}`, {
          employee20: clamp2(num(employee20Str)),
        });
      } catch (e: any) {
        setError(e?.response?.data?.message || "Erro ao salvar valor do funcionário.");
      }
    }, 350);
  }

  // ==========================
  // UI
  // ==========================
  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ margin: "0 0 12px 0" }}>Vale Refeição</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#555" }}>Competência</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {/* Passos */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={step === 1 ? "primary" : ""} onClick={() => setStep(1)}>
            1) Notas e valores
          </button>
          <button className={step === 2 ? "primary" : ""} disabled={!invoice} onClick={() => setStep(2)}>
            2) Lançamento folha
          </button>
          <button className={step === 3 ? "primary" : ""} disabled={!invoice} onClick={() => setStep(3)}>
            3) Resumo final
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b42318", fontSize: 13 }}>
            <b>Erro:</b> {error}
          </div>
        )}
      </div>

      {/* PASSO 1 */}
      {step === 1 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <b>Digite os valores das duas notas</b>
              <div style={{ fontSize: 12, color: "#555" }}>
                Preencha as categorias de custo (Almoço / Café / Terceiros). O sistema soma e usa o total de <b>Almoço</b>{" "}
                no passo 2.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="primary" onClick={saveStep1} disabled={saving || isClosed}>
                {invoice ? "Salvar valores" : "Criar mês"}
              </button>
              <button
                onClick={async () => {
                  await saveStep1();
                  setStep(2);
                }}
                disabled={saving || isClosed}
              >
                Salvar e continuar
              </button>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Nº NF (2ª quinzena)</label>
              <input
                value={invoiceSecondHalfNumber}
                onChange={(e) => setInvoiceSecondHalfNumber(e.target.value)}
                disabled={Boolean(isClosed)}
                placeholder="Ex: 123456"
              />
            </div>
            <div className="field">
              <label>Nº NF (1ª quinzena do mês seguinte)</label>
              <input
                value={invoiceFirstHalfNextNumber}
                onChange={(e) => setInvoiceFirstHalfNextNumber(e.target.value)}
                disabled={Boolean(isClosed)}
                placeholder="Ex: 654321"
              />
            </div>
          </div>

          {/* Totais gerais (AGORA 100% DINÂMICOS) */}
          <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div className="card" style={{ padding: 12, minWidth: 320 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>Total NF (2ª quinzena)</span>
                <b>{moneyBRL(computed.notes.secondHalf)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                <span>Total NF (1ª quinzena)</span>
                <b>{moneyBRL(computed.notes.firstHalfNext)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                <span>Total das duas notas</span>
                <b>{moneyBRL(computed.notes.total)}</b>
              </div>
            </div>

            <div className="card" style={{ padding: 12, minWidth: 320 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>Total Almoço</span>
                <b>{moneyBRL(computed.lunchTotal)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                <span>Total Café</span>
                <b>{moneyBRL(computed.coffeeTotal)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                <span>Total Terceiros</span>
                <b>{moneyBRL(computed.thirdPartyTotal)}</b>
              </div>
            </div>
          </div>

          {/* Inputs por grupo */}
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {GROUPS.map((g) => {
              const groupKey = g.tone === "meal" ? "lunch" : g.tone === "coffee" ? "coffee" : "third";
              const byPart = computed.groupTotalsByPart[groupKey];
              return (
                <div key={g.title} className="card" style={{ padding: 12, ...toneStyle(g.tone) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <b>{g.title}</b>
                      <div style={{ fontSize: 12, color: "#555" }}>{g.hint}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#555" }}>
                      2ª quinzena: <b>{moneyBRL(byPart.secondHalf)}</b> • 1ª quinzena: <b>{moneyBRL(byPart.firstHalfNext)}</b>
                    </div>
                  </div>

                  <div className="table-wrap" style={{ marginTop: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: "45%" }}>Item</th>
                          <th>2ª quinzena</th>
                          <th>1ª quinzena</th>
                          <th className="money">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.kinds.map((kind) => {
                          const a = lines[kind]["SECOND_HALF"];
                          const b = lines[kind]["FIRST_HALF_NEXT"];
                          const t = clamp2(num(a) + num(b));
                          return (
                            <tr key={kind}>
                              <td>{LABEL[kind]}</td>
                              <td>
                                <input
                                  className="value-input"
                                  inputMode="decimal"
                                  value={a}
                                  disabled={Boolean(isClosed)}
                                  onChange={(e) => updateLine(kind, "SECOND_HALF", e.target.value)}
                                  placeholder="0,00"
                                />
                              </td>
                              <td>
                                <input
                                  className="value-input"
                                  inputMode="decimal"
                                  value={b}
                                  disabled={Boolean(isClosed)}
                                  onChange={(e) => updateLine(kind, "FIRST_HALF_NEXT", e.target.value)}
                                  placeholder="0,00"
                                />
                              </td>
                              <td className="money">
                                <b>{moneyBRL(t)}</b>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PASSO 2 */}
      {step === 2 && (
        <>
          {!invoice ? (
            <div className="card">
              <b>Nenhum mês criado para esta competência.</b>
              <p style={{ marginTop: 8, color: "#555" }}>
                Volte para o passo 1, preencha as notas e clique em <b>Criar mês</b>.
              </p>
            </div>
          ) : (
            <div className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <b>Funcionários do mês</b> <span style={{ fontSize: 12, color: "#555" }}>({rows.length})</span>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Ajuste o desconto (20%). O sistema calcula 80% e 100%. Deve bater com o total de <b>Almoço</b> das
                    notas.
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
                  <input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} />
                  Mostrar apenas lançados
                </label>
              </div>

              <div style={{ marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div className="card" style={{ padding: 12, minWidth: 320, borderColor: "#cfe7c3" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Total Almoço (notas)</span>
                    <b>{moneyBRL(computed.lunchTotal)}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <span>Soma (100%) dos funcionários</span>
                    <b>{moneyBRL(allocTotals.sumTotal100)}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <span>Diferença (Almoço - Funcionários)</span>
                    <b className={Math.abs(allocTotals.diffLunch) < 0.01 ? "ok" : "warn"}>{moneyBRL(allocTotals.diffLunch)}</b>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                    {Math.abs(allocTotals.diffLunch) < 0.01
                      ? "✅ Fechamento OK: soma (100%) bate com o total de Almoço."
                      : allocTotals.diffLunch > 0
                      ? "Falta lançar valores de Almoço para bater com o total."
                      : "Você lançou acima do total de Almoço. Ajuste os valores."}
                  </div>
                </div>

                <div className="card" style={{ padding: 12, minWidth: 320 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Empresa (80%)</span>
                    <b>{moneyBRL(allocTotals.sumCompany80)}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <span>Funcionários (20%)</span>
                    <b>{moneyBRL(allocTotals.sumEmployee20)}</b>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                    Regra: valor lançado é 20% (desconto). Total = 20% × 5. Empresa = 20% × 4.
                  </div>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="col-name">Nome</th>
                      <th className="col-matricula">Matrícula</th>
                      <th className="col-filial">Filial</th>
                      <th className="col-centro">Centro</th>
                      <th className="col-20">Valor (20%)</th>
                      <th className="col-money money">Empresa (80%)</th>
                      <th className="col-money money">Total (100%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a: any) => (
                      <tr key={a.employeeId} className={a.filled ? "row-diff" : ""}>
                        <td className="col-name">{a.employee.name}</td>
                        <td className="col-matricula">{a.employee.matricula}</td>
                        <td className="col-filial">{a.employee.branch}</td>
                        <td className="col-centro">{a.employee.costCenter}</td>

                        <td className="col-20">
                          <input
                            className="value-input"
                            inputMode="decimal"
                            value={String(a.employee20)}
                            disabled={Boolean(isClosed)}
                            onChange={(e) => {
                              updateLocal(a.employeeId, e.target.value);
                              scheduleSaveAllocation(a.employeeId, e.target.value);
                            }}
                            placeholder="0,00"
                          />
                        </td>

                        {/* AGORA DINÂMICO (calculado do 20%) */}
                        <td className="col-money money">{moneyBRL(a.company80Num)}</td>
                        <td className="col-money money">{moneyBRL(a.total100Num)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setStep(1)}>Voltar</button>
                <button className="primary" onClick={() => setStep(3)} disabled={!invoice}>
                  Ir para resumo final
                </button>
              </div>

              {isClosed && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>🔒 Este mês está fechado e não pode mais ser alterado.</div>
              )}
            </div>
          )}
        </>
      )}

      {/* PASSO 3 */}
      {step === 3 && (
        <>
          {!invoice ? (
            <div className="card">
              <b>Nenhum mês criado para esta competência.</b>
              <p style={{ marginTop: 8, color: "#555" }}>Volte para o passo 1 e crie o mês.</p>
            </div>
          ) : (
            <div className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <b>Resumo final</b>{" "}
                  <span style={{ fontSize: 12, color: "#555" }}>
                    ({employeeCountFiltered} funcionários)
                  </span>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Café é rateado igualmente: <b>{moneyBRL(coffeePerEmployeeFiltered)}</b> por colaborador.
                  </div>
                </div>

                {/* ✅ Filtro por centro */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Centro de custo</label>
                    <select value={costCenterFilter} onChange={(e) => setCostCenterFilter(e.target.value)}>
                      <option value="ALL">Todos</option>
                      {costCenters.map((cc) => (
                        <option key={cc} value={cc}>
                          {cc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button onClick={() => setStep(2)}>Voltar</button>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div className="card" style={{ padding: 12, minWidth: 260, ...toneStyle("meal") }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Total Almoço (notas)</span>
                    <b>{moneyBRL(computed.lunchTotal)}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <span>Empresa (80%)</span>
                    <b>{moneyBRL(finalTotals.sumCompany80)}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <span>Funcionários (20%)</span>
                    <b>{moneyBRL(finalTotals.sumEmployee20)}</b>
                  </div>
                </div>

                <div className="card" style={{ padding: 12, minWidth: 260, ...toneStyle("coffee") }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Total Café (notas)</span>
                    <b>{moneyBRL(computed.coffeeTotal)}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <span>Por colaborador</span>
                    <b>{moneyBRL(coffeePerEmployeeFiltered)}</b>
                  </div>
                </div>

                <div className="card" style={{ padding: 12, minWidth: 260, ...toneStyle("third") }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Total Terceiros</span>
                    <b>{moneyBRL(computed.thirdPartyTotal)}</b>
                  </div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
                    Visitantes: <b>{moneyBRL(computed.thirdPartyByKind.VISITORS)}</b> • Terceiros:{" "}
                    <b>{moneyBRL(computed.thirdPartyByKind.THIRD_PARTY)}</b> • Doação:{" "}
                    <b>{moneyBRL(computed.thirdPartyByKind.DONATION)}</b>
                  </div>
                </div>

                <div className="card" style={{ padding: 12, minWidth: 260 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Total das duas notas</span>
                    <b>{moneyBRL(computed.notes.total)}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <span>Total empresa (80% almoço + café)</span>
                    <b>{moneyBRL(companyTotalWithCoffeeFiltered)}</b>
                  </div>
                </div>
              </div>

              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="col-name">Nome do colaborador</th>
                      <th className="col-matricula">Matrícula</th>
                      <th className="col-centro">Centro</th>
                      <th className="money">20% Almoço</th>
                      <th className="money">80% Almoço (Empresa)</th>
                      <th className="money">100% Almoço</th>
                      <th className="money">Café (Empresa)</th>
                      <th className="money">Empresa total (80% + café)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDerivedAllocations
                      .slice()
                      .sort((a: any, b: any) => a.employee.name.localeCompare(b.employee.name, "pt-BR"))
                      .map((a: any) => {
                        const compTotal = clamp2(a.company80Num + coffeePerEmployeeFiltered);
                        return (
                          <tr key={a.employeeId}>
                            <td className="col-name">{a.employee.name}</td>
                            <td className="col-matricula">{a.employee.matricula}</td>
                            <td className="col-centro">{a.employee.costCenter}</td>
                            <td className="money">{moneyBRL(a.employee20Num)}</td>
                            <td className="money">{moneyBRL(a.company80Num)}</td>
                            <td className="money">{moneyBRL(a.total100Num)}</td>
                            <td className="money">{moneyBRL(coffeePerEmployeeFiltered)}</td>
                            <td className="money">
                              <b>{moneyBRL(compTotal)}</b>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* opcional: um rodapé pequeno informando quando o filtro está ligado */}
              {costCenterFilter !== "ALL" && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
                  Filtro aplicado: Centro <b>{costCenterFilter}</b> • Funcionários filtrados: <b>{employeeCountFiltered}</b> • Café por colaborador:{" "}
                  <b>{moneyBRL(coffeePerEmployeeFiltered)}</b>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
