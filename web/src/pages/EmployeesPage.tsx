import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, Employee } from "../api";

type ListResponse = { items: Employee[]; total: number; page: number; pageSize: number };

function toDateInputValue(iso: string) {
  // ISO -> YYYY-MM-DD
  return iso.slice(0, 10);
}

function formatBrDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);

  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");

  // Debounce na busca para não martelar o banco a cada tecla
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const [branch, setBranch] = useState("");
  const [costCenter, setCostCenter] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Employee | null>(null);

  const [form, setForm] = useState({
    name: "",
    matricula: "",
    costCenter: "",
    branch: "",
    admissionDate: "",
    terminationDate: "",
    voucherMarketExcluded: false,
    voucherMealExcluded: false,
  });

  // Modal de demissão
  const terminateDialogRef = useRef<HTMLDialogElement>(null);
  const [terminating, setTerminating] = useState<Employee | null>(null);
  const [terminationDate, setTerminationDate] = useState(() => new Date().toISOString().slice(0, 10));

  function openCreate() {
    setEditing(null);
    setForm({ name: "", matricula: "", costCenter: "", branch: "", admissionDate: "", terminationDate: "", voucherMarketExcluded: false, voucherMealExcluded: false });
    dialogRef.current?.showModal();
  }

  function openEdit(e: Employee) {
    setEditing(e);
    setForm({
      name: e.name,
      matricula: e.matricula,
      costCenter: e.costCenter,
      branch: e.branch,
      admissionDate: toDateInputValue(e.admissionDate),
      terminationDate: e.terminationDate ? toDateInputValue(e.terminationDate) : "",
      voucherMarketExcluded: Boolean(e.voucherMarketExcluded),
      voucherMealExcluded: Boolean(e.voucherMealExcluded),
    });
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
  }

  function openTerminate(e: Employee) {
    setTerminating(e);
    setTerminationDate(new Date().toISOString().slice(0, 10));
    terminateDialogRef.current?.showModal();
  }

  function closeTerminateModal() {
    terminateDialogRef.current?.close();
    setTerminating(null);
  }

  async function load() {
    const { data } = await api.get<ListResponse>("/employees", {
      params: { status, search, branch, costCenter, page, pageSize },
    });
    setItems(data.items);
    setTotal(data.total);
  }

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, branch, costCenter, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  async function save() {
    const payload: any = {
      name: form.name,
      costCenter: form.costCenter,
      branch: form.branch,
      admissionDate: form.admissionDate,
      voucherMarketExcluded: form.voucherMarketExcluded,
      voucherMealExcluded: form.voucherMealExcluded,
    };

    if (!editing) {
      payload.matricula = form.matricula;
    }

    // terminationDate só se o RH quiser colocar manualmente
    if (form.terminationDate) payload.terminationDate = form.terminationDate;

    if (!editing) {
      await api.post("/employees", payload);
    } else {
      await api.put(`/employees/${editing.id}`, payload);
    }

    closeModal();
    await load();
  }

  async function submitTerminate() {
    if (!terminating) return;
    if (!terminationDate) return;

    await api.patch(`/employees/${terminating.id}/terminate`, { terminationDate });
    closeTerminateModal();
    await load();
  }

  async function reactivate(e: Employee) {
    if (!confirm("Reativar (limpar demissão)?")) return;
    await api.patch(`/employees/${e.id}/reactivate`);
    await load();
  }

  return (
    <div className="container">
      <h1 style={{ margin: "0 0 12px 0" }}>Funcionários</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <div className="field">
            <label>Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="active">Ativos</option>
              <option value="inactive">Demitidos</option>
              <option value="all">Todos</option>
            </select>
          </div>

          <div className="field">
            <label>Busca (nome ou matrícula)</label>
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Ex: 5625 ou Adelina"
            />
          </div>

          <div className="field">
            <label>Filial</label>
            <input
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setPage(1);
              }}
              placeholder="Ex: 1"
            />
          </div>

          <div className="field">
            <label>Centro de Custo</label>
            <input
              value={costCenter}
              onChange={(e) => {
                setCostCenter(e.target.value);
                setPage(1);
              }}
              placeholder="Ex: 2253"
            />
          </div>

          <div style={{ marginLeft: "auto" }}>
            <button className="primary" onClick={openCreate}>
              Novo funcionário
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <b>Total:</b> {total}
          </div>
          <div className="actions">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Anterior
            </button>
            <span style={{ padding: "10px 0" }}>
              {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Próxima
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Matrícula</th>
              <th>Centro</th>
              <th>Filial</th>
              <th>Admissão</th>
              <th>Demissão</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => {
              const inactive = Boolean(e.terminationDate);
              return (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.matricula}</td>
                  <td>{e.costCenter}</td>
                  <td>{e.branch}</td>
                  <td>{formatBrDate(e.admissionDate)}</td>
                  <td>{formatBrDate(e.terminationDate)}</td>
                  <td>
                    <span className={"badge" + (inactive ? " inactive" : "")}>{inactive ? "Demitido" : "Ativo"}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button onClick={() => openEdit(e)}>Editar</button>
                      {!inactive ? (
                        <button className="danger" onClick={() => openTerminate(e)}>
                          Demitir
                        </button>
                      ) : (
                        <button onClick={() => reactivate(e)}>Reativar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Criar/Editar */}
      <dialog ref={dialogRef}>
        <div className="modal">
          <header>
            <b>{editing ? "Editar funcionário" : "Novo funcionário"}</b>
            <button onClick={closeModal}>Fechar</button>
          </header>

          <div className="content">
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Nome</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="field">
                <label>Matrícula</label>
                <input
                  value={form.matricula}
                  disabled={Boolean(editing)}
                  onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
                />
              </div>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Centro de Custo</label>
                <input
                  value={form.costCenter}
                  onChange={(e) => setForm((f) => ({ ...f, costCenter: e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Filial</label>
                <input value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} />
              </div>

              <div className="field">
                <label>Admissão</label>
                <input
                  type="date"
                  value={form.admissionDate}
                  onChange={(e) => setForm((f) => ({ ...f, admissionDate: e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Demissão (opcional)</label>
                <input
                  type="date"
                  value={form.terminationDate}
                  onChange={(e) => setForm((f) => ({ ...f, terminationDate: e.target.value }))}
                />
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Participação em benefícios</label>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 6 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!form.voucherMarketExcluded}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, voucherMarketExcluded: !e.target.checked }))
                        }
                      />
                      Vale Mercado
                    </label>

                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!form.voucherMealExcluded}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, voucherMealExcluded: !e.target.checked }))
                        }
                      />
                      Vale Refeição
                    </label>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                    Se desmarcar, o funcionário não aparece na tela do benefício.
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#555", marginTop: 12 }}>
              Dica: para demitir, use o botão “Demitir” na tabela (recomendado).
            </p>
          </div>

          <div className="footer">
            <button onClick={closeModal}>Cancelar</button>
            <button className="primary" onClick={save}>
              Salvar
            </button>
          </div>
        </div>
      </dialog>

      {/* Modal Demissão */}
      <dialog ref={terminateDialogRef}>
        <div className="modal">
          <header>
            <b>Demitir funcionário</b>
            <button onClick={closeTerminateModal}>Fechar</button>
          </header>

          <div className="content">
            {terminating && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div>
                    <b>Nome:</b> {terminating.name}
                  </div>
                  <div>
                    <b>Matrícula:</b> {terminating.matricula}
                  </div>
                </div>

                <div className="field" style={{ maxWidth: 260 }}>
                  <label>Data de demissão</label>
                  <input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
                </div>

                <p style={{ fontSize: 12, color: "#555", marginTop: 12 }}>
                  Observação: a demissão não remove o funcionário do sistema, apenas marca a data.
                </p>
              </>
            )}
          </div>

          <div className="footer">
            <button onClick={closeTerminateModal}>Cancelar</button>
            <button className="danger" onClick={submitTerminate} disabled={!terminating || !terminationDate}>
              Confirmar demissão
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
