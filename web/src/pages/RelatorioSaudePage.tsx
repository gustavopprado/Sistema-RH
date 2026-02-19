import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";

type EmployeeLite = {
  id: number;
  name: string;
  matricula: string;
  branch: string;
  costCenter: string;
};

type HealthByMonthItem = {
  employee: EmployeeLite;
  monthlyCompany: string;
  unimedCompany: string;
  conveniosCompany: string;
  totalCompany: string;
};

type HealthByMonthResponse = {
  month: string;
  items: HealthByMonthItem[];
  totals: {
    monthlyCompany: string;
    unimedCompany: string;
    conveniosCompany: string;
    totalCompany: string;
  };
};

// -------- Detalhe (mesma estrutura do relatório antigo, porém 1 mês) --------
type HealthReportMonth = {
  month: string; // YYYY-MM
  monthly: null | {
    invoiceId: number;
    competence: string;
    invoiceNumber: string;
    invoiceValue: string;
    unitValue: string;
    status: string;
    closedAt: string | null;
    dependents: number;
    lives: number;
    amountTotal: string;
    amountCompany: string;
    amountEmployee: string;
  };
  unimedUsages: Array<{
    id: number;
    invoiceId: number;
    competence: string;
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
    competence: string;
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

type HealthReportResponse = {
  employee: {
    id: number;
    name: string;
    matricula: string;
    branch: string;
    costCenter: string;
    admissionDate: string;
    terminationDate: string | null;
  };
  months: HealthReportMonth[];
  totals: {
    company: string;
    employee: string;
    gross: string;
  };
};

function nowMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseHash(hash: string) {
  const raw = (hash || "#/relatorio-saude").startsWith("#") ? hash.slice(1) : hash;
  const [path, qs] = raw.split("?");
  const query = new URLSearchParams(qs || "");
  return { path, query };
}

function moneyBRL(v: string | number) {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0
  );
}

function kindLabel(kind: "PERSONAL" | "WORK_ACCIDENT") {
  return kind === "WORK_ACCIDENT" ? "Acidente de trabalho" : "Pessoal";
}

function goToList(month: string) {
  window.location.hash = `#/relatorio-saude?month=${encodeURIComponent(month)}`;
}

function goToDetail(employeeId: number, month: string) {
  window.location.hash = `#/relatorio-saude/detalhe/${employeeId}?month=${encodeURIComponent(month)}`;
}

function setUrlMonth(month: string) {
  // Atualiza o URL sem disparar navegação (mantém o mês ao dar refresh/copy link)
  const next = `#/relatorio-saude?month=${encodeURIComponent(month)}`;
  window.history.replaceState(null, "", next);
}

function ListView({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState<string>(initialMonth);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<HealthByMonthResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Se o usuário navegar pelo histórico e o mês vier do URL, sincroniza.
  useEffect(() => {
    if (initialMonth && initialMonth !== month) setMonth(initialMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMonth]);

  useEffect(() => {
    setUrlMonth(month);
  }, [month]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get<HealthByMonthResponse>("/reports/health/by-month", {
          params: { month },
        });
        setData(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || "Erro ao gerar relatório.");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [month, reloadKey]);

  const items = useMemo(() => {
    const arr = data?.items || [];
    const q = filter.trim().toLowerCase();
    const filtered = !q
      ? arr
      : arr.filter((it) => {
          const e = it.employee;
          return (
            e.name.toLowerCase().includes(q) ||
            e.matricula.toLowerCase().includes(q) ||
            e.branch.toLowerCase().includes(q) ||
            e.costCenter.toLowerCase().includes(q)
          );
        });
    // Mostrar quem tem custo primeiro
    return filtered.slice().sort((a, b) => Number(b.totalCompany) - Number(a.totalCompany));
  }, [data, filter]);

  const totals = data?.totals;

  return (
    <div className="container">
      <h2>Relatório • Saúde (por mês)</h2>
      <div className="muted" style={{ marginBottom: 12 }}>
        Mostra quanto a <b>empresa</b> arca com saúde (mensalidade Unimed + procedimentos Unimed + convênios) em uma competência.
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field">
              <span>Competência</span>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>

            <div className="field">
              <span>Filtrar (nome, matrícula, centro, filial)</span>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Digite para filtrar" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {loading ? <span className="muted">Carregando…</span> : null}
            <button className="ghost" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {totals ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div className="muted">Unimed (Mensalidade) • Empresa</div>
              <div style={{ fontWeight: 800 }}>{moneyBRL(totals.monthlyCompany)}</div>
            </div>
            <div>
              <div className="muted">Unimed (Procedimentos) • Empresa</div>
              <div style={{ fontWeight: 800 }}>{moneyBRL(totals.unimedCompany)}</div>
            </div>
            <div>
              <div className="muted">Convênios (Procedimentos) • Empresa</div>
              <div style={{ fontWeight: 800 }}>{moneyBRL(totals.conveniosCompany)}</div>
            </div>
            <div>
              <div className="muted">Total Saúde • Empresa</div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{moneyBRL(totals.totalCompany)}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Matrícula</th>
                <th>Filial/Centro</th>
                <th className="money">Unimed Mensalidade</th>
                <th className="money">Unimed Proced.</th>
                <th className="money">Convênios</th>
                <th className="money">Total (Empresa)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 14 }}>
                    {loading ? "Carregando..." : "Nenhum funcionário encontrado para este filtro."}
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const e = it.employee;
                  return (
                    <tr key={e.id}>
                      <td>
                        <b>{e.name}</b>
                      </td>
                      <td>{e.matricula}</td>
                      <td>
                        {e.branch}/{e.costCenter}
                      </td>
                      <td className="money">{moneyBRL(it.monthlyCompany)}</td>
                      <td className="money">{moneyBRL(it.unimedCompany)}</td>
                      <td className="money">{moneyBRL(it.conveniosCompany)}</td>
                      <td className="money">
                        <b>{moneyBRL(it.totalCompany)}</b>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="ghost"
                          onClick={() => goToDetail(e.id, month)}
                          disabled={loading}
                          title="Ver detalhamento"
                        >
                          Detalhar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Regra: <b>Mensalidade Unimed = 100% empresa</b>. Procedimentos (Unimed/Convênios): <b>Pessoal 70/30</b> e <b>Acidente 100% empresa</b>.
        </div>
      </div>
    </div>
  );
}

function DetailView({ employeeId, month }: { employeeId: number; month: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [report, setReport] = useState<HealthReportResponse | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      setReport(null);
      try {
        const { data } = await api.get<HealthReportResponse>("/reports/health/detail", {
          params: { employeeId, month },
        });
        setReport(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || "Erro ao gerar relatório.");
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId, month]);

  const m = report?.months?.[0];

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Relatório • Saúde (detalhado)</h2>
          <div className="muted">Competência: <b>{month}</b></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost" onClick={() => goToList(month)}>
            ← Voltar
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading ? <div className="card" style={{ marginTop: 12 }}>Carregando…</div> : null}

      {report && m ? (
        <>
          <div className="card" style={{ marginTop: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{report.employee.name}</div>
                <div className="muted">
                  Matrícula: <b>{report.employee.matricula}</b> • Filial/Centro: <b>{report.employee.branch}/{report.employee.costCenter}</b>
                </div>
              </div>

              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <div>
                  <div className="muted">Total (Empresa)</div>
                  <div style={{ fontWeight: 900 }}>{moneyBRL(report.totals.company)}</div>
                </div>
                <div>
                  <div className="muted">Total (Funcionário)</div>
                  <div style={{ fontWeight: 900 }}>{moneyBRL(report.totals.employee)}</div>
                </div>
                <div>
                  <div className="muted">Total (Bruto)</div>
                  <div style={{ fontWeight: 900 }}>{moneyBRL(report.totals.gross)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Unimed Mensalidade */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Unimed • Mensalidade (100% empresa)</div>
            {m.monthly ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nº NF</th>
                      <th className="money">Valor NF</th>
                      <th className="money">Unitário</th>
                      <th className="money">Dependentes</th>
                      <th className="money">Vidas</th>
                      <th className="money">Total (funcionário)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{m.monthly.invoiceNumber || "—"}</td>
                      <td className="money">{moneyBRL(m.monthly.invoiceValue)}</td>
                      <td className="money">{moneyBRL(m.monthly.unitValue)}</td>
                      <td className="money">{m.monthly.dependents}</td>
                      <td className="money">{m.monthly.lives}</td>
                      <td className="money"><b>{moneyBRL(m.monthly.amountTotal)}</b></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted">Sem mensalidade registrada neste mês.</div>
            )}
          </div>

          {/* Unimed Procedimentos */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Unimed • Procedimentos</div>
            {m.unimedUsages.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Obs.</th>
                      <th className="money">Total</th>
                      <th className="money">Empresa</th>
                      <th className="money">Funcionário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.unimedUsages.map((u) => (
                      <tr key={u.id}>
                        <td>{kindLabel(u.kind)}</td>
                        <td title={u.note || ""}>{u.note || "—"}</td>
                        <td className="money">{moneyBRL(u.amountTotal)}</td>
                        <td className="money"><b>{moneyBRL(u.amountCompany)}</b></td>
                        <td className="money">{moneyBRL(u.amountEmployee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted">Sem procedimentos Unimed neste mês.</div>
            )}
          </div>

          {/* Convênios */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Convênios médicos • Procedimentos</div>
            {m.convenios.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Prestador</th>
                      <th>Tipo</th>
                      <th>Obs.</th>
                      <th className="money">Total</th>
                      <th className="money">Empresa</th>
                      <th className="money">Funcionário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.convenios.map((u) => (
                      <tr key={`${u.provider}-${u.id}`}>
                        <td>{u.providerLabel}</td>
                        <td>{kindLabel(u.kind)}</td>
                        <td title={u.note || ""}>{u.note || "—"}</td>
                        <td className="money">{moneyBRL(u.amountTotal)}</td>
                        <td className="money"><b>{moneyBRL(u.amountCompany)}</b></td>
                        <td className="money">{moneyBRL(u.amountEmployee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted">Sem procedimentos em convênios neste mês.</div>
            )}
          </div>

          <div className="muted">
            Regras: Mensalidade Unimed = <b>100% empresa</b>. Procedimentos (Unimed/Convênios): <b>Pessoal 70/30</b> e <b>Acidente 100% empresa</b>.
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function RelatorioSaudePage() {
  const [hash, setHash] = useState(() => window.location.hash || "#/relatorio-saude");

  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/relatorio-saude");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const { path, query } = useMemo(() => parseHash(hash), [hash]);
  const month = query.get("month") || nowMonth();

  const detailMatch = path.match(/^\/relatorio-saude\/detalhe\/(\d+)$/);
  const employeeId = detailMatch ? Number(detailMatch[1]) : null;

  if (employeeId) {
    return <DetailView employeeId={employeeId} month={month} />;
  }

  return <ListView initialMonth={month} />;
}
