import React, { useEffect, useMemo, useState } from "react";
import EmployeesPage from "./pages/EmployeesPage";
import ValeMercadoPage from "./pages/ValeMercadoPage";
import ValeRefeicaoPage from "./pages/ValeRefeicaoPage";
import ValeRefeicaoFilial02Page from "./pages/ValeRefeicaoFilial02Page";

type Route = "employees" | "vale-mercado" | "vale-refeicao" | "vale-refeicao-filial-02";

function getRouteFromHash(): Route {
  const h = (window.location.hash || "#/employees").replace("#", "");
  if (h.startsWith("/vale-mercado")) return "vale-mercado";
  if (h.startsWith("/vale-refeicao-filial-02")) return "vale-refeicao-filial-02";
  if (h.startsWith("/vale-refeicao")) return "vale-refeicao";
  return "employees";
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash());

  useEffect(() => {
    const onHash = () => setRoute(getRouteFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const title = useMemo(() => {
    if (route === "vale-mercado") return "Vale Mercado";
    if (route === "vale-refeicao") return "Vale Refeição • Filial 01";
    if (route === "vale-refeicao-filial-02") return "Vale Refeição • Filial 02";
    return "Funcionários";
  }, [route]);

  function go(to: Route) {
    if (to === "employees") window.location.hash = "#/employees";
    else if (to === "vale-mercado") window.location.hash = "#/vale-mercado";
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
        ) : route === "vale-refeicao-filial-02" ? (
          <ValeRefeicaoFilial02Page />
        ) : (
          <ValeRefeicaoPage />
        )}
      </main>
    </div>
  );
}
