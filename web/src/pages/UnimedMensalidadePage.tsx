import React, { useEffect, useMemo, useState } from "react";
import { api, Employee, UnimedMonthlyInvoice, UnimedMonthlyInvoiceDetails } from "../api";

function monthNow(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function toCents(v: string | number): number {
  return Math.round(num(v) * 100);
}

function centsToString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function moneyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type AllocLocal = {
  id?: number;
  dependents: number;
  amountTotal: string; // "0.00"
};

export default function UnimedMensalidadePage() {
  const [month, setMonth] = useState<string>(() => monthNow());

  const [invoice, setInvoice] = useState<UnimedMonthlyInvoice | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [invoiceValue, setInvoiceValue] = useState<string>("");
  const [unitValue, setUnitValue] = useState<string>("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allocByEmp, setAllocByEmp] = useState<Record<number, AllocLocal>>({});

  const [search, setSearch] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const isClosed = invoice?.status === "CLOSED";

  const totals = useMemo(() => {
    const invCents = toCents(invoiceValue || invoice?.invoiceValue || 0);
    const unitCents = toCents(unitValue || invoice?.unitValue || 0);

    let sumCents = 0;
    let lives = 0;

    for (const e of employees) {
      const a = allocByEmp[e.id];
      if (!a) continue;
      sumCents += toCents(a.amountTotal);
      lives += (a.dependents ?? 0) + 1;
    }

    const diffCents = invCents - sumCents;

    return {
      invoiceCents: invCents,
      unitCents,
      sumCents,
      diffCents,
      lives,
    };
  }, [allocByEmp, employees, invoiceValue, unitValue, invoice]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q) || e.matricula.toLowerCase().includes(q) || e.costCenter.toLowerCase().includes(q));
  }, [employees, search]);

  async function loadInvoiceDetails(invoiceId: number) {
    const { data } = await api.get<UnimedMonthlyInvoiceDetails>(`/unimed-monthly/invoices/${invoiceId}`);
    setInvoice(data.invoice);
    setInvoiceNumber(data.invoice.invoiceNumber || "");
    setInvoiceValue(data.invoice.invoiceValue || "");
    setUnitValue(data.invoice.unitValue || "");
    setEmployees(data.employees);

    const next: Record<number, AllocLocal> = {};
    for (const a of data.allocations) {
      next[a.employeeId] = { id: a.id, dependents: a.dependents, amountTotal: a.amountTotal };
    }

    // Se algum funcionário ainda não tem alocação, deixa 0 (até aplicar o unitValue)
    for (const e of data.employees) {
      if (!next[e.id]) next[e.id] = { dependents: 0, amountTotal: "0.00" };
    }

    setAllocByEmp(next);
  }

  async function createOrLoadMonth() {
    setError("");
    setSaving(true);
    try {
      // 1) tenta carregar
      const byMonth = await api.get<{ invoice: UnimedMonthlyInvoice | null }>("/unimed-monthly/invoices/by-month", {
        params: { month },
      });

      if (byMonth.data.invoice) {
        await loadInvoiceDetails(byMonth.data.invoice.id);
        return;
      }

      // 2) cria
      if (!invoiceNumber.trim()) throw new Error("Informe o número da nota fiscal.");
      if (toCents(invoiceValue) <= 0) throw new Error("Informe o valor total da nota fiscal.");
      if (toCents(unitValue) <= 0) throw new Error("Informe o valor unitário da mensalidade.");

      const created = await api.post<{ invoiceId: number }>("/unimed-monthly/invoices", {
        month,
        invoiceNumber,
        invoiceValue,
        unitValue,
      });

      await loadInvoiceDetails(created.data.invoiceId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Erro ao carregar/criar mês.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHeader() {
    if (!invoice) return;
    setError("");
    setSaving(true);
    try {
      if (!invoiceNumber.trim()) throw new Error("Informe o número da nota fiscal.");
      if (toCents(invoiceValue) <= 0) throw new Error("Informe o valor total da nota fiscal.");
      if (toCents(unitValue) <= 0) throw new Error("Informe o valor unitário da mensalidade.");

      await api.patch(`/unimed-monthly/invoices/${invoice.id}`, {
        invoiceNumber,
        invoiceValue,
        unitValue,
      });

      await loadInvoiceDetails(invoice.id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Erro ao salvar cabeçalho.");
    } finally {
      setSaving(false);
    }
  }

  async function applyUnitToAll() {
    if (!invoice) return;
    setError("");
    setSaving(true);
    try {
      if (toCents(unitValue) <= 0) throw new Error("Informe o valor unitário da mensalidade.");
      await api.post(`/unimed-monthly/invoices/${invoice.id}/apply-unit`, { unitValue });
      await loadInvoiceDetails(invoice.id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Erro ao aplicar mensalidade.");
    } finally {
      setSaving(false);
    }
  }

  function computeAmountForDependents(dependents: number): string {
    const unitCents = toCents(unitValue || invoice?.unitValue || 0);
    if (unitCents <= 0) return "0.00";
    return centsToString(unitCents * (dependents + 1));
  }

  async function setDependents(employeeId: number, dependents: number) {
    if (!invoice) return;
    if (isClosed) return;

    const deps = Math.max(0, Math.floor(dependents));

    // otimista
    setAllocByEmp((prev) => {
      const current = prev[employeeId] || { dependents: 0, amountTotal: "0.00" };
      return {
        ...prev,
        [employeeId]: {
          ...current,
          dependents: deps,
          amountTotal: computeAmountForDependents(deps),
        },
      };
    });

    try {
      await api.patch(`/unimed-monthly/invoices/${invoice.id}/allocations/${employeeId}`, { dependents: deps });
    } catch (err: any) {
      // desfaz carregando do servidor (garante consistência)
      await loadInvoiceDetails(invoice.id);
      throw err;
    }
  }

  async function closeMonth() {
    if (!invoice) return;
    setError("");
    setSaving(true);
    try {
      await api.post(`/unimed-monthly/invoices/${invoice.id}/close`);
      await loadInvoiceDetails(invoice.id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Erro ao fechar mês.");
    } finally {
      setSaving(false);
    }
  }

  async function reopenMonth() {
    if (!invoice) return;
    setError("");
    setSaving(true);
    try {
      await api.post(`/unimed-monthly/invoices/${invoice.id}/reopen`);
      await loadInvoiceDetails(invoice.id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Erro ao reabrir mês.");
    } finally {
      setSaving(false);
    }
  }

  // quando mudar o unitValue na UI, recalcula os cards (visual) sem salvar ainda
  useEffect(() => {
    const unitCents = toCents(unitValue || 0);
    if (unitCents <= 0) return;

    setAllocByEmp((prev) => {
      const next: Record<number, AllocLocal> = { ...prev };
      for (const e of employees) {
        const a = next[e.id];
        if (!a) continue;
        const deps = a.dependents ?? 0;
        next[e.id] = { ...a, amountTotal: centsToString(unitCents * (deps + 1)) };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitValue]);

  const canClose = !!invoice && !isClosed && Math.abs(totals.diffCents) < 1;

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>Unimed • Mensalidade</h2>
          <div className="muted">Defina a mensalidade unitária e ajuste dependentes para bater com a nota fiscal.</div>
        </div>

        {invoice ? (
          <span className="badge" style={{ fontWeight: 700 }}>
            Status: {invoice.status === "CLOSED" ? "Fechado" : "Em edição"}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="card" style={{ borderColor: "#fca5a5", background: "#fff1f2", marginTop: 12 }}>
          <b>Erro:</b> {error}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>1) Selecione o mês e informe o cabeçalho da NF</h3>

        <div className="row">
          <div className="field">
            <span>Mês (competência)</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={saving} />
          </div>

          <div className="field">
            <span>Número da NF</span>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex: 12345" disabled={saving || isClosed} />
          </div>

          <div className="field">
            <span>Valor total da NF</span>
            <input
              inputMode="decimal"
              value={invoiceValue}
              onChange={(e) => setInvoiceValue(e.target.value)}
              placeholder="0,00"
              disabled={saving || isClosed}
            />
          </div>

          <div className="field">
            <span>Valor unitário (por vida)</span>
            <input
              inputMode="decimal"
              value={unitValue}
              onChange={(e) => setUnitValue(e.target.value)}
              placeholder="0,00"
              disabled={saving || isClosed}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <button className="primary" onClick={createOrLoadMonth} disabled={saving}>
              {invoice ? "Recarregar" : "Criar / Carregar mês"}
            </button>

            {invoice ? (
              <button className="ghost" onClick={saveHeader} disabled={saving || isClosed}>
                Salvar cabeçalho
              </button>
            ) : null}
          </div>
        </div>

        {invoice ? (
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="badge">Unitário: <b>{moneyBRL((toCents(unitValue) || toCents(invoice.unitValue)) / 100)}</b></span>
            <span className="badge">Vidas: <b>{totals.lives}</b></span>
            <span className="badge">Soma: <b>{moneyBRL(totals.sumCents / 100)}</b></span>
            <span className={"badge " + (Math.abs(totals.diffCents) < 1 ? "ok" : "warn")}>
              Diferença: <b>{moneyBRL(totals.diffCents / 100)}</b>
            </span>
          </div>
        ) : null}

        {invoice && !isClosed ? (
          <div style={{ marginTop: 10 }}>
            <button className="ghost" onClick={applyUnitToAll} disabled={saving}>
              Aplicar valor unitário a todos os funcionários
            </button>
            <div className="muted">Dica: ao salvar o cabeçalho, o sistema também recalcula automaticamente.</div>
          </div>
        ) : null}
      </div>

      {invoice ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>2) Ajuste dependentes por funcionário</h3>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ minWidth: 260 }}>
                <span>Buscar</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, matrícula ou centro de custo..." />
              </div>

              {isClosed ? (
                <button className="ghost" onClick={reopenMonth} disabled={saving}>
                  Reabrir mês
                </button>
              ) : (
                <button className="primary" onClick={closeMonth} disabled={saving || !canClose} title={!canClose ? "A diferença precisa ser R$ 0,00 para fechar" : ""}>
                  Fechar mês
                </button>
              )}
            </div>
          </div>

          <div className="muted" style={{ marginTop: 8 }}>
            Regra: <b>Total do colaborador = valor unitário × (dependentes + 1)</b> (titular + dependentes).
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {filteredEmployees.map((e) => {
              const a = allocByEmp[e.id] || { dependents: 0, amountTotal: "0.00" };
              const deps = a.dependents ?? 0;
              const lives = deps + 1;
              const total = num(a.amountTotal);

              return (
                <div key={e.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{e.name}</div>
                      <div style={{ color: "#667085", fontSize: 12 }}>
                        Centro de custo: <b>{e.costCenter}</b> • Matrícula: {e.matricula}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span className="badge">Dependentes: <b>{deps}</b></span>
                      <span className="badge">Vidas: <b>{lives}</b></span>
                      <span className="badge">Total: <b>{moneyBRL(total)}</b></span>

                      <button
                        className="ghost"
                        disabled={saving || isClosed}
                        onClick={() => setDependents(e.id, deps + 1).catch((err) => setError(err?.response?.data?.message || err?.message || "Erro"))}
                        style={{ borderRadius: 12 }}
                      >
                        + Dependente
                      </button>

                      <button
                        className="ghost"
                        disabled={saving || isClosed || deps === 0}
                        onClick={() => setDependents(e.id, deps - 1).catch((err) => setError(err?.response?.data?.message || err?.message || "Erro"))}
                        style={{ borderRadius: 12 }}
                        title={deps === 0 ? "Sem dependentes" : ""}
                      >
                        -
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredEmployees.length === 0 ? <div className="muted">Nenhum funcionário encontrado.</div> : null}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="badge">NF: <b>{moneyBRL(totals.invoiceCents / 100)}</b></span>
            <span className="badge">Soma: <b>{moneyBRL(totals.sumCents / 100)}</b></span>
            <span className={"badge " + (Math.abs(totals.diffCents) < 1 ? "ok" : "warn")}>
              Diferença: <b>{moneyBRL(totals.diffCents / 100)}</b>
            </span>
            <span className="badge">Vidas: <b>{totals.lives}</b></span>
          </div>

          {!isClosed ? (
            <div className="muted" style={{ marginTop: 8 }}>
              Para fechar o mês, a diferença precisa ser <b>R$ 0,00</b>.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
