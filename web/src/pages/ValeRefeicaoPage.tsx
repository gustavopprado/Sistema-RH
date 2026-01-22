import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, VoucherMealAllocation, VoucherMealInvoice, VoucherMealInvoiceDetails } from "../api";

function moneyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
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

export default function ValeRefeicaoPage() {
  const [month, setMonth] = useState<string>(() => monthNow());

  const [invoice, setInvoice] = useState<VoucherMealInvoice | null>(null);
  const [invoiceSecondHalf, setInvoiceSecondHalf] = useState<string>("");
  const [invoiceFirstHalfNext, setInvoiceFirstHalfNext] = useState<string>("");

  const [allocations, setAllocations] = useState<VoucherMealAllocation[]>([]);
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // debounce por funcionário
  const timers = useRef<Record<number, any>>({});

  const isClosed = invoice?.status === "CLOSED";

  const rows = useMemo(() => {
    const list = allocations.map((a) => {
      const employee20 = num(a.employee20);
      const total100 = clamp2(employee20 * 5);
      const company80 = clamp2(employee20 * 4);
      const filled = employee20 > 0;
      return {
        ...a,
        employee20Num: employee20,
        total100Num: total100,
        company80Num: company80,
        filled,
      } as any;
    });
    return onlyFilled ? list.filter((x: any) => x.filled) : list;
  }, [allocations, onlyFilled]);

  const totals = useMemo(() => {
    const invA = num(invoiceSecondHalf);
    const invB = num(invoiceFirstHalfNext);
    const invoiceTotal = clamp2(invA + invB);

    const sumTotal100 = clamp2(allocations.reduce((acc, a) => acc + (num(a.employee20) * 5), 0));
    const sumCompany80 = clamp2(allocations.reduce((acc, a) => acc + (num(a.employee20) * 4), 0));
    const sumEmployee20 = clamp2(allocations.reduce((acc, a) => acc + num(a.employee20), 0));

    const diff = clamp2(invoiceTotal - sumTotal100);
    return { invoiceTotal, sumTotal100, sumCompany80, sumEmployee20, diff };
  }, [invoiceSecondHalf, invoiceFirstHalfNext, allocations]);

  async function loadInvoiceDetails(id: number) {
    const { data } = await api.get<VoucherMealInvoiceDetails>(`/voucher-meal/invoices/${id}`);
    setInvoice(data.invoice);
    setInvoiceSecondHalf(String(data.invoice.invoiceSecondHalf));
    setInvoiceFirstHalfNext(String(data.invoice.invoiceFirstHalfNext));
    setAllocations(data.allocations);
  }

  async function loadByMonth() {
    setError("");
    setSaving(true);
    try {
      const { data } = await api.get<{ invoice: VoucherMealInvoice | null }>(
        "/voucher-meal/invoices/by-month",
        { params: { month } }
      );

      if (!data.invoice) {
        setInvoice(null);
        setAllocations([]);
        setInvoiceSecondHalf("");
        setInvoiceFirstHalfNext("");
        return;
      }

      await loadInvoiceDetails(data.invoice.id);
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
    const a = num(invoiceSecondHalf);
    const b = num(invoiceFirstHalfNext);
    if (a <= 0 && b <= 0) return setError("Informe ao menos um valor de nota.");

    setSaving(true);
    try {
      const { data } = await api.post<{ invoiceId: number; existed: boolean }>(
        "/voucher-meal/invoices",
        { month, invoiceSecondHalf: a, invoiceFirstHalfNext: b }
      );

      if (data.existed) {
        await loadInvoiceDetails(data.invoiceId);
        setError("Este mês já existe e foi carregado.");
        return;
      }

      await loadInvoiceDetails(data.invoiceId);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao criar o mês.");
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoiceHeader() {
    if (!invoice) return;
    if (isClosed) return setError("Mês já está fechado.");

    const a = num(invoiceSecondHalf);
    const b = num(invoiceFirstHalfNext);
    if (a <= 0 && b <= 0) return setError("Informe ao menos um valor de nota.");

    setSaving(true);
    setError("");
    try {
      await api.patch(`/voucher-meal/invoices/${invoice.id}`, {
        invoiceSecondHalf: a,
        invoiceFirstHalfNext: b,
      });
      await loadInvoiceDetails(invoice.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao salvar notas.");
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

  return (
    <div className="container">
      <h1 style={{ margin: "0 0 12px 0" }}>Vale Refeição</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <div className="field">
            <label>Competência</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>

          <div className="field">
            <label>NF (2ª quinzena do mês)</label>
            <input
              value={invoiceSecondHalf}
              inputMode="decimal"
              disabled={isClosed}
              onChange={(e) => setInvoiceSecondHalf(e.target.value)}
              placeholder="Ex: 15000"
            />
          </div>

          <div className="field">
            <label>NF (1ª quinzena do mês seguinte)</label>
            <input
              value={invoiceFirstHalfNext}
              inputMode="decimal"
              disabled={isClosed}
              onChange={(e) => setInvoiceFirstHalfNext(e.target.value)}
              placeholder="Ex: 20000"
            />
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!invoice ? (
              <button className="primary" onClick={createMonth} disabled={saving}>
                Criar mês
              </button>
            ) : (
              <button className="primary" onClick={saveInvoiceHeader} disabled={saving || isClosed}>
                Salvar notas
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b42318", fontSize: 13 }}>
            <b>Erro:</b> {error}
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, minWidth: 320 }}>
              <span>Total das notas</span>
              <b>{moneyBRL(totals.invoiceTotal)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
              <span>Soma (100%) dos funcionários</span>
              <b>{moneyBRL(totals.sumTotal100)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
              <span>Diferença (Notas - Funcionários)</span>
              <b className={Math.abs(totals.diff) < 0.01 ? "ok" : "warn"}>{moneyBRL(totals.diff)}</b>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              {Math.abs(totals.diff) < 0.01
                ? "✅ Fechamento OK: soma (100%) bate com o total das notas."
                : totals.diff > 0
                ? "Falta lançar valores para bater com o total das notas."
                : "Você lançou acima do total das notas. Ajuste os valores."}
            </div>
          </div>

          <div className="card" style={{ padding: 12, minWidth: 320 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>Empresa (80%)</span>
              <b>{moneyBRL(totals.sumCompany80)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
              <span>Funcionários (20%)</span>
              <b>{moneyBRL(totals.sumEmployee20)}</b>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              Regra: valor lançado é 20% (desconto). Total = 20% × 5. Empresa = 20% × 4.
            </div>
          </div>
        </div>
      </div>

      {!invoice ? (
        <div className="card">
          <b>Nenhum mês criado para esta competência.</b>
          <p style={{ marginTop: 8, color: "#555" }}>
            Preencha os valores das notas e clique em <b>Criar mês</b>. O sistema irá carregar os funcionários ativos no
            período para você lançar o desconto (20%).
          </p>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <b>Funcionários do mês</b>{" "}
              <span style={{ fontSize: 12, color: "#555" }}>({rows.length})</span>
              <div style={{ fontSize: 12, color: "#555" }}>
                Lançar o desconto (20%). O sistema calcula 80% e 100%.
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
              <input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} />
              Mostrar apenas lançados
            </label>
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
                {rows.map((a: any) => {
                  return (
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
                          disabled={isClosed}
                          onChange={(e) => {
                            updateLocal(a.employeeId, e.target.value);
                            scheduleSaveAllocation(a.employeeId, e.target.value);
                          }}
                          placeholder="0,00"
                        />
                      </td>

                      <td className="col-money money">{moneyBRL(a.company80Num)}</td>
                      <td className="col-money money">{moneyBRL(a.total100Num)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isClosed && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
              🔒 Este mês está fechado e não pode mais ser alterado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
