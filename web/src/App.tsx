import React, { useEffect, useMemo, useState } from "react";
import EmployeesPage from "./pages/EmployeesPage";
import ValeMercadoPage from "./pages/ValeMercadoPage";
import ValeRefeicaoPage from "./pages/ValeRefeicaoPage";
import ValeRefeicaoFilial02Page from "./pages/ValeRefeicaoFilial02Page";
import UnimedPage from "./pages/UnimedPage";
import UnimedMensalidadePage from "./pages/UnimedMensalidadePage";
import RelatorioSaudePage from "./pages/RelatorioSaudePage";
import LaboratorioSantaCruzPage from "./pages/LaboratorioSantaCruzPage";
import CentroDiagnosticoCapaoRasoPage from "./pages/CentroDiagnosticoCapaoRasoPage";
import PoliclinicaCapaoRasoPage from "./pages/PoliclinicaCapaoRasoPage";
import PoliclinicaMansurPage from "./pages/PoliclinicaMansurPage";


type Route =
  | "employees"
  | "vale-mercado"
  | "vale-refeicao"
  | "vale-refeicao-filial-02"
  | "unimed"
  | "unimed-mensalidade"
  | "relatorio-saude"
  | "convenio-laboratorio-santa-cruz"
  | "convenio-centro-diagnostico-capao-raso"
  | "convenio-policlinica-capao-raso"
  | "convenio-policlinica-mansur";

function isConvenioRoute(r: Route) {
  return (
    r === "convenio-laboratorio-santa-cruz" ||
    r === "convenio-centro-diagnostico-capao-raso" ||
    r === "convenio-policlinica-capao-raso" ||
    r === "convenio-policlinica-mansur"
  );
}

function getRouteFromHash(): Route {
  const h = (window.location.hash || "#/employees").replace("#", "");
  if (h.startsWith("/vale-mercado")) return "vale-mercado";
  if (h.startsWith("/relatorio-saude")) return "relatorio-saude";
  if (h.startsWith("/unimed-mensalidade")) return "unimed-mensalidade";
  if (h.startsWith("/unimed")) return "unimed";
  if (h.startsWith("/convenio-laboratorio-santa-cruz")) return "convenio-laboratorio-santa-cruz";
  if (h.startsWith("/convenio-centro-diagnostico-capao-raso")) return "convenio-centro-diagnostico-capao-raso";
  if (h.startsWith("/convenio-policlinica-capao-raso")) return "convenio-policlinica-capao-raso";
  if (h.startsWith("/convenio-policlinica-mansur")) return "convenio-policlinica-mansur";
  if (h.startsWith("/vale-refeicao-filial-02")) return "vale-refeicao-filial-02";
  if (h.startsWith("/vale-refeicao")) return "vale-refeicao";
  return "employees";
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash());
  const [conveniosOpen, setConveniosOpen] = useState<boolean>(() => isConvenioRoute(getRouteFromHash()));

  useEffect(() => {
    const onHash = () => setRoute(getRouteFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Se o usuário entrar direto em uma rota de convênio, abre o grupo automaticamente
  useEffect(() => {
    if (isConvenioRoute(route)) setConveniosOpen(true);
  }, [route]);

  const title = useMemo(() => {
    if (route === "vale-mercado") return "Vale Mercado";
    if (route === "unimed") return "Unimed • Plano de Saúde";
    if (route === "unimed-mensalidade") return "Unimed • Mensalidade";
    if (route === "relatorio-saude") return "Relatório • Saúde";
    if (route === "convenio-laboratorio-santa-cruz") return "Laboratório Santa Cruz";
    if (route === "convenio-centro-diagnostico-capao-raso") return "Centro de Diagnóstico Capão Raso";
    if (route === "convenio-policlinica-capao-raso") return "Policlínica Capão Raso";
    if (route === "convenio-policlinica-mansur") return "Policlínica Mansur";
    if (route === "vale-refeicao") return "Vale Refeição • Filial 01";
    if (route === "vale-refeicao-filial-02") return "Vale Refeição • Filial 02";
    return "Funcionários";
  }, [route]);

  function go(to: Route) {
    if (to === "employees") window.location.hash = "#/employees";
    else if (to === "vale-mercado") window.location.hash = "#/vale-mercado";
    else if (to === "relatorio-saude") window.location.hash = "#/relatorio-saude";
    else if (to === "unimed") window.location.hash = "#/unimed";
    else if (to === "unimed-mensalidade") window.location.hash = "#/unimed-mensalidade";
    else if (to === "convenio-laboratorio-santa-cruz") window.location.hash = "#/convenio-laboratorio-santa-cruz";
    else if (to === "convenio-centro-diagnostico-capao-raso") window.location.hash = "#/convenio-centro-diagnostico-capao-raso";
    else if (to === "convenio-policlinica-capao-raso") window.location.hash = "#/convenio-policlinica-capao-raso";
    else if (to === "convenio-policlinica-mansur") window.location.hash = "#/convenio-policlinica-mansur";
    else if (to === "vale-refeicao") window.location.hash = "#/vale-refeicao";
    else window.location.hash = "#/vale-refeicao-filial-02";
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="sidebar-title">RH • Custos</div>
          <div className="sidebar-sub">Gestão de benefícios</div>
        </div>

        <nav className="sidebar-nav">
          <button className={"sidebtn" + (route === "employees" ? " active" : "")} onClick={() => go("employees")}>
            Funcionários
          </button>

          <button
            className={"sidebtn" + (route === "vale-mercado" ? " active" : "")}
            onClick={() => go("vale-mercado")}
          >
            Vale Mercado
          </button>

          <button
            className={"sidebtn" + (route === "unimed" ? " active" : "")}
            onClick={() => go("unimed")}
          >
            Unimed (Plano de Saúde)
          </button>

          <button
            className={"sidebtn" + (route === "unimed-mensalidade" ? " active" : "")}
            onClick={() => go("unimed-mensalidade")}
          >
            Unimed (Mensalidade)
          </button>

          <button
            className={"sidebtn" + (route === "relatorio-saude" ? " active" : "")}
            onClick={() => go("relatorio-saude")}
          >
            Relatório (Saúde)
          </button>

          <div className="sidegroup">
            <button
              className={
                "sidebtn group" +
                ((conveniosOpen || isConvenioRoute(route)) ? " group-open" : "")
              }
              onClick={() => setConveniosOpen((v) => !v)}
              type="button"
            >
              <span>Convênios médicos</span>
              <span className="chev">{conveniosOpen ? "▾" : "▸"}</span>
            </button>

            {conveniosOpen ? (
              <div className="sidegroup-items">
                <button
                  className={
                    "sidebtn sub" +
                    (route === "convenio-laboratorio-santa-cruz" ? " active" : "")
                  }
                  onClick={() => go("convenio-laboratorio-santa-cruz")}
                >
                  Laboratório Santa Cruz
                </button>

                <button
                  className={
                    "sidebtn sub" +
                    (route === "convenio-centro-diagnostico-capao-raso" ? " active" : "")
                  }
                  onClick={() => go("convenio-centro-diagnostico-capao-raso")}
                >
                  Centro de Diagnóstico Capão Raso
                </button>

                <button
                  className={
                    "sidebtn sub" +
                    (route === "convenio-policlinica-capao-raso" ? " active" : "")
                  }
                  onClick={() => go("convenio-policlinica-capao-raso")}
                >
                  Policlínica Capão Raso
                </button>

                <button
                  className={
                    "sidebtn sub" +
                    (route === "convenio-policlinica-mansur" ? " active" : "")
                  }
                  onClick={() => go("convenio-policlinica-mansur")}
                >
                  Policlínica Mansur
                </button>
              </div>
            ) : null}
          </div>

          <button
            className={"sidebtn" + (route === "vale-refeicao" ? " active" : "")}
            onClick={() => go("vale-refeicao")}
          >
            Vale Refeição • Filial 01
          </button>

          <button
            className={"sidebtn" + (route === "vale-refeicao-filial-02" ? " active" : "")}
            onClick={() => go("vale-refeicao-filial-02")}
          >
            Vale Refeição • Filial 02
          </button>
        </nav>

        <div className="sidebar-foot">
          <span style={{ fontSize: 12, color: "#667085" }}>Atual:</span>
          <b style={{ fontSize: 13 }}>{title}</b>
        </div>
      </aside>

      <main className="content">
        {route === "employees" ? (
          <EmployeesPage />
        ) : route === "vale-mercado" ? (
          <ValeMercadoPage />
        ) : route === "relatorio-saude" ? (
          <RelatorioSaudePage />
        ) : route === "unimed-mensalidade" ? (
          <UnimedMensalidadePage />
        ) : route === "unimed" ? (
          <UnimedPage />
        ) : route === "convenio-laboratorio-santa-cruz" ? (
          <LaboratorioSantaCruzPage />
        ) : route === "convenio-centro-diagnostico-capao-raso" ? (
          <CentroDiagnosticoCapaoRasoPage />
        ) : route === "convenio-policlinica-capao-raso" ? (
          <PoliclinicaCapaoRasoPage />
        ) : route === "convenio-policlinica-mansur" ? (
          <PoliclinicaMansurPage />
        ) : route === "vale-refeicao-filial-02" ? (
          <ValeRefeicaoFilial02Page />
        ) : (
          <ValeRefeicaoPage />
        )}
      </main>
    </div>
  );
}
