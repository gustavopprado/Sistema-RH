import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, Employee, UnimedInvoice, UnimedInvoiceDetails, UnimedUsageKind } from "../api";

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

function moneyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function centsToNumber(cents: number): number {
  return cents / 100;
}

function split(kind: UnimedUsageKind, total: number) {
  const totalCents = toCents(total);
  if (kind === "WORK_ACCIDENT") {
    return { employee: 0, company: total };
  }
  const empCents = Math.round(totalCents * 0.3);
  const compCents = totalCents - empCents;
  return { employee: centsToNumber(empCents), company: centsToNumber(compCents) };
}

type LocalLine = {
  key: string;
  kind: UnimedUsageKind;
  amountTotal: string; // "100%"
  note: string;
};

function makeKey() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

type EmployeeTotals = { total: number; emp: number; comp: number };

type EmployeeCardProps = {
  e: Employee;
  mode: "edit" | "summary";
  isClosed: boolean;
  open: boolean;
  notesOpen: boolean;
  totals: EmployeeTotals;
  lines: LocalLine[];
  onToggleOpen: () => void;
  onToggleNotes: () => void;
  onAddLine: () => void;
  onUpdateLine: (key: string, patch: Partial<LocalLine>) => void;
  onRemoveLine: (key: string) => void;
};

const EmployeeCard = React.memo(function EmployeeCard(props: EmployeeCardProps) {
  const { e, mode, isClosed, open, notesOpen, totals, lines, onToggleOpen, onToggleNotes, onAddLine, onUpdateLine, onRemoveLine } = props;
  const editable = mode === "edit" && !isClosed;

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800 }}>{e.name}</div>
          <div style={{ color: "#667085", fontSize: 12 }}>
            Centro de custo: <b>{e.costCenter}</b> • Matrícula: {e.matricula}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="badge" title="Total do uso (100%)">
            100%: <b>{moneyBRL(totals.total)}</b>
          </span>
          <span className="badge" title="Desconto do funcionário">
            Func.: <b>{moneyBRL(totals.emp)}</b>
          </span>
          <span className="badge" title="Custo da empresa">
            Empresa: <b>{moneyBRL(totals.comp)}</b>
          </span>
          <button className="ghost" onClick={onToggleNotes} style={{ padding: "8px 10px", borderRadius: 12 }}>
            {notesOpen ? "Ocultar obs." : "Observações"}
          </button>

          <button className="ghost" onClick={onToggleOpen} style={{ padding: "8px 10px", borderRadius: 12 }}>
            {open ? "Ocultar" : "Detalhes"}
          </button>
          {mode === "edit" && !isClosed && (
            <button className="primary" onClick={onAddLine} style={{ padding: "8px 10px", borderRadius: 12 }}>
              + Lançamento
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {lines.length === 0 ? (
            <div className="muted">Nenhum lançamento para este funcionário.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {lines.map((l) => {
                const total = num(l.amountTotal);
                const s = total > 0 ? split(l.kind, total) : { employee: 0, company: 0 };

                return (
                  <div
                    key={l.key}
                    className="unimed-line"
                    style={{ gridTemplateColumns: "220px 180px 1fr 44px" }}
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className={l.kind === "PERSONAL" ? "primary" : "ghost"}
                        disabled={!editable}
                        onClick={() => onUpdateLine(l.key, { kind: "PERSONAL" })}
                        style={{ padding: "8px 10px", borderRadius: 999 }}
                      >
                        Uso pessoal
                      </button>
                      <button
                        className={l.kind === "WORK_ACCIDENT" ? "primary" : "ghost"}
                        disabled={!editable}
                        onClick={() => onUpdateLine(l.key, { kind: "WORK_ACCIDENT" })}
                        style={{ padding: "8px 10px", borderRadius: 999 }}
                      >
                        Acidente de trabalho
                      </button>
                    </div>

                    <div className="field" style={{ margin: 0 }}>
                      <span style={{ fontSize: 12, color: "#667085" }}>Valor (100%)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={!editable}
                        value={l.amountTotal}
                        placeholder="0,00"
                        onChange={(ev) => onUpdateLine(l.key, { amountTotal: ev.target.value })}
                      />
                    </div>

                    <div style={{ fontSize: 13, color: "#334155" }}>
                      {l.kind === "PERSONAL" ? (
                        <div>
                          Funcionário (30%): <b>{moneyBRL(s.employee)}</b> • Empresa (70%): <b>{moneyBRL(s.company)}</b>
                        </div>
                      ) : (
                        <div>
                          Empresa (100%): <b>{moneyBRL(total)}</b>
                        </div>
                      )}
                      <div className="muted">Use mais de um lançamento se precisar separar pessoal x acidente no mesmo mês.</div>
                      {(notesOpen || (!editable && l.note && String(l.note).trim().length > 0)) && (
                        <div style={{ marginTop: 8 }}>
                          {editable ? (
                            <div className="field" style={{ margin: 0 }}>
                              <span style={{ fontSize: 12, color: "#667085" }}>Observações</span>
                              <textarea
                                disabled={!editable}
                                value={l.note || ""}
                                placeholder="Escreva uma observação para este lançamento..."
                                rows={2}
                                onChange={(ev) => onUpdateLine(l.key, { note: ev.target.value })}
                              />
                            </div>
                          ) : (
                            <div className="muted">
                              <b>Obs:</b> {l.note}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      className="danger"
                      disabled={!editable}
                      onClick={() => onRemoveLine(l.key)}
                      title="Remover lançamento"
                      style={{ padding: "8px", borderRadius: 12 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {mode === "edit" && !isClosed && (
            <div style={{ marginTop: 10 }}>
              <button className="ghost" onClick={onAddLine}>
                + Adicionar lançamento
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default function UnimedPage() {
  const [month, setMonth] = useState<string>(() => monthNow());
  const [step, setStep] = useState<1 | 2>(1);

  const [invoice, setInvoice] = useState<UnimedInvoice | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceValue, setInvoiceValue] = useState<string>("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [linesByEmp, setLinesByEmp] = useState<Record<number, LocalLine[]>>({});
  const linesByEmpRef = useRef<Record<number, LocalLine[]>>({});

  const [openEmp, setOpenEmp] = useState<Record<number, boolean>>({});
  const [showNotesEmp, setShowNotesEmp] = useState<Record<number, boolean>>({});
  const [onlyUsed, setOnlyUsed] = useState(false);
  const [search, setSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const isClosed = invoice?.status === "CLOSED";
  const timers = useRef<Record<number, any>>({});

  useEffect(() => {
    linesByEmpRef.current = linesByEmp;
  }, [linesByEmp]);

  function getEmpLines(employeeId: number): LocalLine[] {
    return linesByEmp[employeeId] || [];
  }

  function setEmpLines(employeeId: number, lines: LocalLine[]) {
    setLinesByEmp((prev) => ({ ...prev, [employeeId]: lines }));
  }

  function computeEmployeeTotals(employeeId: number) {
    const lines = getEmpLines(employeeId);
    let total = 0;
    let emp = 0;
    let comp = 0;
    for (const l of lines) {
      const t = num(l.amountTotal);
      if (t <= 0) continue;
      total += t;
      const s = split(l.kind, t);
      emp += s.employee;
      comp += s.company;
    }
    // arredondamento visual
    total = Math.round(total * 100) / 100;
    emp = Math.round(emp * 100) / 100;
    comp = Math.round(comp * 100) / 100;
    return { total, emp, comp };
  }

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (q) {
        const hay = `${e.name} ${e.matricula} ${e.costCenter}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (onlyUsed) {
        const t = computeEmployeeTotals(e.id).total;
        if (t <= 0) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, search, onlyUsed, linesByEmp]);

  const totals = useMemo(() => {
    const inv = num(invoiceValue);
    let sum100 = 0;
    let sumEmp = 0;
    let sumComp = 0;
    for (const e of employees) {
      const t = computeEmployeeTotals(e.id);
      sum100 += t.total;
      sumEmp += t.emp;
      sumComp += t.comp;
    }
    sum100 = Math.round(sum100 * 100) / 100;
    sumEmp = Math.round(sumEmp * 100) / 100;
    sumComp = Math.round(sumComp * 100) / 100;
    const diff = Math.round((inv - sum100) * 100) / 100;
    return { inv, sum100, sumEmp, sumComp, diff };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceValue, employees, linesByEmp]);

  async function loadInvoiceDetails(id: number) {
    const { data } = await api.get<UnimedInvoiceDetails>(`/unimed/invoices/${id}`);
    setInvoice(data.invoice);
    setInvoiceNumber(data.invoice.invoiceNumber);
    setInvoiceValue(String(data.invoice.invoiceValue));
    setEmployees(data.employees);

    // agrupa usos por funcionário
    const grouped: Record<number, LocalLine[]> = {};
    for (const u of data.usages) {
      if (!grouped[u.employeeId]) grouped[u.employeeId] = [];
      grouped[u.employeeId].push({ key: String(u.id), kind: u.kind, amountTotal: String(u.amountTotal), note: String(u.note || "") });
    }

    // garante array (mesmo sem usos)
    const filled: Record<number, LocalLine[]> = {};
    for (const e of data.employees) filled[e.id] = grouped[e.id] || [];
    setLinesByEmp(filled);
  }

  async function loadByMonth() {
    setError("");
    setSaving(true);
    try {
      const { data } = await api.get<{ invoice: UnimedInvoice | null }>("/unimed/invoices/by-month", {
        params: { month },
      });

      if (!data.invoice) {
        setInvoice(null);
        setEmployees([]);
        setLinesByEmp({});
        setInvoiceNumber("");
        setInvoiceValue("");
        setStep(1);
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
    if (!invoiceNumber.trim()) return setError("Informe o número da nota fiscal.");
    const inv = num(invoiceValue);
    if (inv <= 0) return setError("Informe o valor total da nota fiscal.");

    setSaving(true);
    try {
      const { data } = await api.post<{ invoiceId: number; existed: boolean }>("/unimed/invoices", {
        month,
        invoiceNumber,
        invoiceValue: inv,
      });
      await loadInvoiceDetails(data.invoiceId);
      if (data.existed) setError("Este mês já existe e foi carregado.");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao criar o mês.");
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoiceHeader() {
    if (!invoice) return;
    if (isClosed) return setError("Mês já está fechado.");

    if (!invoiceNumber.trim()) return setError("Informe o número da nota fiscal.");
    const inv = num(invoiceValue);
    if (inv <= 0) return setError("Informe o valor total da nota fiscal.");

    setSaving(true);
    setError("");
    try {
      await api.patch(`/unimed/invoices/${invoice.id}`, { invoiceNumber, invoiceValue: inv });
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
      await api.post(`/unimed/invoices/${invoice.id}/reopen`);
      await loadInvoiceDetails(invoice.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao reabrir mês.");
    } finally {
      setSaving(false);
    }
  }

  function scheduleSaveEmployee(employeeId: number) {
    if (!invoice || isClosed) return;
    if (timers.current[employeeId]) clearTimeout(timers.current[employeeId]);

    timers.current[employeeId] = setTimeout(async () => {
      const lines = linesByEmpRef.current[employeeId] || [];
      const payload = lines.map((l) => ({ kind: l.kind, amountTotal: num(l.amountTotal), note: l.note || "" }));
      try {
        await api.patch(`/unimed/invoices/${invoice.id}/usages/${employeeId}`, { usages: payload });
      } catch (e: any) {
        setError(e?.response?.data?.message || "Erro ao salvar valores.");
      }
    }, 350);
  }

  function addLine(employeeId: number) {
    const lines = [...getEmpLines(employeeId)];
    lines.push({ key: makeKey(), kind: "PERSONAL", amountTotal: "", note: "" });
    setEmpLines(employeeId, lines);
    setOpenEmp((p) => ({ ...p, [employeeId]: true }));
    scheduleSaveEmployee(employeeId);
  }

  function removeLine(employeeId: number, key: string) {
    const lines = getEmpLines(employeeId).filter((l) => l.key !== key);
    setEmpLines(employeeId, lines);
    scheduleSaveEmployee(employeeId);
  }

  function updateLine(employeeId: number, key: string, patch: Partial<LocalLine>) {
    const lines = getEmpLines(employeeId).map((l) => (l.key === key ? { ...l, ...patch } : l));
    setEmpLines(employeeId, lines);
    scheduleSaveEmployee(employeeId);
  }

  async function closeMonth() {
    if (!invoice) return;
    setError("");

    if (!invoiceNumber.trim()) return setError("Informe o número da nota fiscal.");
    const inv = num(invoiceValue);
    if (inv <= 0) return setError("Informe o valor total da nota fiscal.");

    // valida na UI antes de chamar a API
    if (Math.abs(totals.diff) >= 0.01) {
      return setError("A soma dos lançamentos (100%) deve bater com o valor total da nota fiscal para fechar.");
    }

    setSaving(true);
    try {
      await saveInvoiceHeader();
      await api.post(`/unimed/invoices/${invoice.id}/close`);
      await loadInvoiceDetails(invoice.id);
      setStep(2);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Erro ao fechar mês.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <h2>Unimed • Plano de Saúde</h2>
      <div className="muted" style={{ marginBottom: 12 }}>
        Lance os valores por funcionário (pessoal x acidente) e no final feche o mês garantindo que a soma bata com a nota fiscal.
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field">
              <span>Competência (mês)</span>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>

            <div className="field">
              <span>Nº Nota Fiscal</span>
              <input disabled={!!invoice && isClosed} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>

            <div className="field">
              <span>Valor total da NF</span>
              <input disabled={!!invoice && isClosed} value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} placeholder="0,00" />
            </div>

            {!invoice ? (
              <button className="primary" onClick={createMonth} disabled={saving}>
                Criar mês
              </button>
            ) : (
              <>
                <button className="primary" onClick={saveInvoiceHeader} disabled={saving || isClosed}>
                  Salvar nota
                </button>
                {isClosed ? (
                  <button className="ghost" onClick={reopenMonth} disabled={saving}>
                    Reabrir
                  </button>
                ) : (
                  <button className="primary" onClick={closeMonth} disabled={saving || employees.length === 0}>
                    Fechar mês
                  </button>
                )}
              </>
            )}
          </div>

          {invoice && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="badge">Status: <b>{invoice.status}</b></span>
              <button
                className={step === 1 ? "primary" : "ghost"}
                onClick={() => setStep(1)}
                style={{ borderRadius: 999, padding: "8px 10px" }}
              >
                Lançamento
              </button>
              <button
                className={step === 2 ? "primary" : "ghost"}
                onClick={() => setStep(2)}
                style={{ borderRadius: 999, padding: "8px 10px" }}
              >
                Resumo
              </button>
            </div>
          )}
        </div>

        {invoice && (
          <div className="totals">
            <div className={"totals-line " + (Math.abs(totals.diff) < 0.01 ? "ok" : "warn")}>
              <span>Soma lançada (100%)</span>
              <strong>{moneyBRL(totals.sum100)}</strong>
            </div>
            <div className="totals-line">
              <span>Total empresa</span>
              <strong>{moneyBRL(totals.sumComp)}</strong>
            </div>
            <div className="totals-line">
              <span>Total funcionário (descontos)</span>
              <strong>{moneyBRL(totals.sumEmp)}</strong>
            </div>
            <div className={"totals-line " + (Math.abs(totals.diff) < 0.01 ? "ok" : "warn")}>
              <span>Diferença (NF - soma 100%)</span>
              <strong>{moneyBRL(totals.diff)}</strong>
            </div>
            <div className="muted">Para fechar, a diferença precisa ficar em R$ 0,00.</div>
          </div>
        )}
      </div>

      {!invoice ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="muted">Crie o mês acima para começar a lançar os valores.</div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
                <div className="field">
                  <span>Buscar</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="nome, matrícula, centro de custo" />
                </div>

                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
                  Mostrar apenas quem usou
                </label>
              </div>

              <div style={{ fontSize: 13, color: "#667085" }}>
                Funcionários no mês: <b>{employees.length}</b>
              </div>
            </div>
          </div>

          {step === 1 ? (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {filteredEmployees.map((e) => {
                const t = computeEmployeeTotals(e.id);
                const open = !!openEmp[e.id];
                const lines = getEmpLines(e.id);
                return (
                  <EmployeeCard
                    key={e.id}
                    e={e}
                    mode="edit"
                    isClosed={!!isClosed}
                    open={open}
                    notesOpen={!!showNotesEmp[e.id]}
                    totals={t}
                    lines={lines}
                    onToggleOpen={() => setOpenEmp((p) => ({ ...p, [e.id]: !open }))}
                    onToggleNotes={() => { setShowNotesEmp((p) => ({ ...p, [e.id]: !p[e.id] })); setOpenEmp((p) => ({ ...p, [e.id]: true })); }}
                    onAddLine={() => addLine(e.id)}
                    onUpdateLine={(key, patch) => updateLine(e.id, key, patch)}
                    onRemoveLine={(key) => removeLine(e.id, key)}
                  />
                );
              })}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {filteredEmployees
                .filter((e) => computeEmployeeTotals(e.id).total > 0)
                .map((e) => {
                  const t = computeEmployeeTotals(e.id);
                  const open = !!openEmp[e.id];
                  const lines = getEmpLines(e.id);
                  return (
                    <EmployeeCard
                      key={e.id}
                      e={e}
                      mode="summary"
                      isClosed={!!isClosed}
                      open={open}
                      notesOpen={!!showNotesEmp[e.id]}
                      totals={t}
                      lines={lines}
                      onToggleOpen={() => setOpenEmp((p) => ({ ...p, [e.id]: !open }))}
                      onToggleNotes={() => { setShowNotesEmp((p) => ({ ...p, [e.id]: !p[e.id] })); setOpenEmp((p) => ({ ...p, [e.id]: true })); }}
                      onAddLine={() => {}}
                      onUpdateLine={(_key, _patch) => {}}
                      onRemoveLine={(_key) => {}}
                    />
                  );
                })}
              {filteredEmployees.filter((e) => computeEmployeeTotals(e.id).total > 0).length === 0 && (
                <div className="card">
                  <div className="muted">Nenhum funcionário com uso lançado neste mês.</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
