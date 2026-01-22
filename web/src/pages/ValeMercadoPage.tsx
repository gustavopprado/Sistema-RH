import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  VoucherMarketAllocation,
  VoucherMarketAllocationStatus,
  VoucherMarketInvoice,
  VoucherMarketInvoiceDetails,
} from "../api";

const BASE = 541.0;

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

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Donut95_5({ total }: { total: number }) {
  const company = total * 0.95;
  const employees = total * 0.05;

  const r = 54;
  const c = 2 * Math.PI * r;
  const pEmp = total <= 0 ? 0 : employees / total;
  const empLen = c * pEmp;
  const compLen = c - empLen;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width="140" height="140" viewBox="0 0 140 140" aria-label="Gráfico 95/5">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e9ecf3" strokeWidth="18" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#7bc258"
          strokeWidth="18"
          strokeDasharray={`${compLen} ${empLen}`}
          strokeDashoffset={0}
          transform="rotate(-90 70 70)"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#6d6e71"
          strokeWidth="18"
          strokeDasharray={`${empLen} ${compLen}`}
          strokeDashoffset={-compLen}
          transform="rotate(-90 70 70)"
        />
        <circle cx="70" cy="70" r="40" fill="#fff" />
        <text x="70" y="66" textAnchor="middle" fontSize="12" fill="#555">
          Total
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="14" fontWeight={700} fill="#111">
          {moneyBRL(total)}
        </text>
      </svg>

      <div className="card" style={{ padding: 12, minWidth: 280 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>Empresa (95%)</span>
          <b>{moneyBRL(company)}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
          <span>Funcionários (5%)</span>
          <b>{moneyBRL(employees)}</b>
        </div>
      </div>
    </div>
  );
}

export default function ValeMercadoPage() {
  const [month, setMonth] = useState<string>(() => monthNow());

  const [invoice, setInvoice] = useState<VoucherMarketInvoice | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceValue, setInvoiceValue] = useState<string>("");
  const [allocations, setAllocations] = useState<VoucherMarketAllocation[]>([]);

  const [onlyDiff, setOnlyDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // debounce por funcionário
  const timers = useRef<Record<number, any>>({});

  const isClosed = invoice?.status === "CLOSED";

  const rows = useMemo(() => {
    const list = allocations.map((a) => {
      const amount = num(a.amount);
      const isDiff = clamp2(amount) !== clamp2(BASE) || a.status !== "DEFAULT";
      return { ...a, amountNum: amount, isDiff };
    });
    return onlyDiff ? list.filter((x: any) => x.isDiff) : list;
  }, [allocations, onlyDiff]);

  const totals = useMemo(() => {
    const inv = num(invoiceValue);
    const sum = allocations.reduce((acc, a) => acc + num(a.amount), 0);
    const diff = clamp2(inv - sum);
    return { inv, sum: clamp2(sum), diff };
  }, [invoiceValue, allocations]);

  async function loadInvoiceDetails(id: number) {
    const { data } = await api.get<VoucherMarketInvoiceDetails>(`/voucher-market/invoices/${id}`);
    setInvoice(data.invoice);
    setInvoiceNumber(data.invoice.invoiceNumber);
    setInvoiceValue(String(data.invoice.invoiceValue));
    setAllocations(data.allocations);
  }

  async function loadByMonth() {
    setError("");
    setSaving(true);
    try {
      const { data } = await api.get<{ invoice: VoucherMarketInvoice | null }>(
        "/voucher-market/invoices/by-month",
        { params: { month } }
      );

      if (!data.invoice) {
        setInvoice(null);
        setAllocations([]);
        setInvoiceNumber("");
        setInvoiceValue("");
        return;
      }

      await loadInvoiceDetails(data.invoice.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao carregar mês.");
    } finally {
      setSaving(false);
    }
  }

  // ✅ Auto-carregar sempre que a competência mudar (e também no primeiro load)
  useEffect(() => {
    loadByMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function createMonth() {
    setError("");
    if (!invoiceNumber.trim()) return setError("Informe o número da nota fiscal.");
    const inv = num(invoiceValue);
    if (inv <= 0) return setError("Informe o valor da nota fiscal.");

    setSaving(true);
    try {
      const { data } = await api.post<{ invoiceId: number; existed: boolean }>(
        "/voucher-market/invoices",
        { month, invoiceNumber, invoiceValue: inv }
      );

      if (data.existed) {
        // se alguém clicou “criar” mas já existia, só carrega
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

    const inv = num(invoiceValue);
    if (inv <= 0) return setError("Informe o valor da nota fiscal.");

    setSaving(true);
    setError("");
    try {
      await api.patch(`/voucher-market/invoices/${invoice.id}`, {
        invoiceNumber,
        invoiceValue: inv,
      });
      await loadInvoiceDetails(invoice.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao salvar nota.");
    } finally {
      setSaving(false);
    }
  }

  async function reopenMonth() {
    if (!invoice) return;
    setError("");
    setSaving(true);
    try {
      await api.post(`/voucher-market/invoices/${invoice.id}/reopen`);
      await loadInvoiceDetails(invoice.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao reabrir mês.");
    } finally {
      setSaving(false);
    }
  }

  function updateLocal(employeeId: number, patch: Partial<VoucherMarketAllocation>) {
    setAllocations((prev) =>
      prev.map((a) => (a.employeeId === employeeId ? { ...a, ...patch } as any : a))
    );
  }

  function scheduleSaveAllocation(employeeId: number, amountStr: string, status: VoucherMarketAllocationStatus) {
    if (!invoice) return;
    if (isClosed) return;

    if (timers.current[employeeId]) clearTimeout(timers.current[employeeId]);

    timers.current[employeeId] = setTimeout(async () => {
      try {
        await api.patch(`/voucher-market/invoices/${invoice.id}/allocations/${employeeId}`, {
          amount: clamp2(num(amountStr)),
          status,
        });
      } catch (e: any) {
        setError(e?.response?.data?.message || "Erro ao salvar valor.");
      }
    }, 350);
  }

  // Botões por funcionário:
  function setFalta(a: VoucherMarketAllocation) {
    if (!invoice || isClosed) return;
    updateLocal(a.employeeId, { amount: "0.00", status: "FALTA" });
  }

  function setExcluir(a: VoucherMarketAllocation) {
    if (!invoice || isClosed) return;
    updateLocal(a.employeeId, { amount: "0.00", status: "EXCLUIDO" });
  }

  function setProporcional(a: VoucherMarketAllocation) {
    if (!invoice || isClosed) return;
    updateLocal(a.employeeId, { status: "PROPORCIONAL" });
  }

  function setReset(a: VoucherMarketAllocation) {
    if (!invoice || isClosed) return;
    updateLocal(a.employeeId, { amount: "541.00", status: "DEFAULT" });
  }


async function closeMonth() {
  if (!invoice) return;

  setError("");
  setSaving(true);

  try {
    const inv = num(invoiceValue);
    if (inv <= 0) {
      setError("Informe o valor da nota fiscal.");
      return;
    }

    const payload = {
      invoiceNumber: invoiceNumber.trim(),
      invoiceValue: inv,
      allocations: allocations.map((a) => ({
        employeeId: a.employeeId,
        amount: clamp2(num(a.amount)).toFixed(2),
        status: a.status,
      })),
    };

    await api.post(`/voucher-market/invoices/${invoice.id}/close`, payload);

    await loadInvoiceDetails(invoice.id);
  } catch (e: any) {
    const msg = e?.response?.data?.message || "Erro ao fechar mês.";
    const diff = e?.response?.data?.diff;
    setError(diff ? `${msg} Diferença: R$ ${diff}` : msg);
  } finally {
    setSaving(false);
  }
}


  return (
    <div className="container">
      <h1 style={{ margin: "0 0 12px 0" }}>Vale Mercado</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <div className="field">
            <label>Competência</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>

          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Nº da Nota Fiscal</label>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ex: 123456"
              disabled={Boolean(isClosed)}
            />
          </div>

          <div className="field">
            <label>Valor da Nota</label>
            <input
              inputMode="decimal"
              value={invoiceValue}
              onChange={(e) => setInvoiceValue(e.target.value)}
              placeholder="Ex: 12500,00"
              disabled={Boolean(isClosed)}
            />
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {!invoice ? (
              <button className="primary" onClick={createMonth} disabled={saving}>
                Criar mês
              </button>
            ) : (
              <>
              {isClosed ? (
                <button onClick={reopenMonth} disabled={saving}>
                  Editar mês
                </button>
              ) : null}
                <button className="primary" onClick={closeMonth} disabled={saving || isClosed}>
                  Salvar mês
                </button>
              </>
            )}
          </div>
        </div>

        {invoice && (
          <div style={{ marginTop: 10, fontSize: 12, color: isClosed ? "#b42318" : "#555" }}>
            Status: <b>{isClosed ? "FECHADO" : "EM EDIÇÃO"}</b>
            {invoice.closedAt ? ` • Fechado em: ${new Date(invoice.closedAt).toLocaleString("pt-BR")}` : ""}
          </div>
        )}

        {error && (
          <div className="card" style={{ marginTop: 12, borderColor: "#f3c3c3" }}>
            <b style={{ color: "#b42318" }}>Atenção:</b> {error}
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, minWidth: 280 }}>
              <span>Total da nota</span>
              <b>{moneyBRL(totals.inv)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
              <span>Soma por funcionário</span>
              <b>{moneyBRL(totals.sum)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
              <span>Diferença</span>
              <b className={Math.abs(totals.diff) < 0.01 ? "ok" : "warn"}>{moneyBRL(totals.diff)}</b>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              {Math.abs(totals.diff) < 0.01
                ? "✅ Fechamento OK: soma dos funcionários bate com a nota."
                : totals.diff > 0
                ? "Falta alocar este valor para bater com a nota."
                : "Você alocou acima do valor da nota. Ajuste os valores."}
            </div>
          </div>

          <Donut95_5 total={totals.inv} />
        </div>
      </div>

      {!invoice ? (
        <div className="card">
          <b>Nenhuma nota cadastrada para esta competência.</b>
          <p style={{ marginTop: 8, color: "#555" }}>
            Preencha o nº da nota e o valor, depois clique em <b>Criar mês</b>. O sistema carrega todos com{" "}
            <b>{moneyBRL(BASE)}</b>.
          </p>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <b>Funcionários do mês</b>{" "}
              <span style={{ fontSize: 12, color: "#555" }}>({rows.length})</span>
              <div style={{ fontSize: 12, color: "#555" }}>
                Padrão: {moneyBRL(BASE)} • Use [Falta] [Proporcional] [Excluir]
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
              <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
              Mostrar divergências
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
                  <th className="col-status">Status</th>
                  <th className="col-value">Valor</th>
                  <th className="col-money money">Empresa (95%)</th>
                  <th className="col-money money">Funcionário (5%)</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>

              <tbody>
                {rows.map((a: any) => {
                  const disabledEdit = isClosed || a.status !== "PROPORCIONAL";
                  const label =
                    a.status === "DEFAULT"
                      ? "Padrão"
                      : a.status === "FALTA"
                      ? "Falta"
                      : a.status === "EXCLUIDO"
                      ? "Excluído"
                      : "Proporcional";

                  return (
                    <tr
                      key={a.employeeId}
                      className={[
                        a.isDiff ? "row-diff" : "",
                        a.status === "FALTA" ? "row-falta" : "",
                        a.status === "EXCLUIDO" ? "row-excluido" : "",
                      ].join(" ").trim()}
                    >
                      <td className="col-name">{a.employee.name}</td>
                      <td className="col-matricula">{a.employee.matricula}</td>
                      <td className="col-filial">{a.employee.branch}</td>
                      <td className="col-centro">{a.employee.costCenter}</td>

                      <td className="col-status">
                        <span className="status-pill">{label}</span>
                      </td>

                      <td className="col-value">
                        <input
                          className="value-input"
                          inputMode="decimal"
                          value={String(a.amount)}
                          disabled={disabledEdit}
                          onChange={(e) => updateLocal(a.employeeId, { amount: e.target.value })}
                        />
                      </td>

                      <td className="col-money money">{fmtMoney(num(a.amount) * 0.95)}</td>
                      <td className="col-money money">{fmtMoney(num(a.amount) * 0.05)}</td>

                      <td className="col-actions">
                        <div className="actions">
                          <button className="danger" onClick={() => setFalta(a)} disabled={isClosed}>
                            Falta
                          </button>
                          
                          <button
                            className="btn-prop"
                            onClick={() => setProporcional(a)}
                            disabled={isClosed}
                          >
                            Proporcional
                          </button>

                          <button onClick={() => setExcluir(a)} disabled={isClosed}>
                            Excluir
                          </button>

                          <button className="ghost" onClick={() => setReset(a)} disabled={isClosed}>
                            Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isClosed && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#b42318" }}>
              Este mês está fechado. Para alterar, seria necessário criar um recurso de “Reabrir mês”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
