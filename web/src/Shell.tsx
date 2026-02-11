import React, { useEffect, useMemo, useState } from "react";
import App from "./App";
import ValeMercadoPage from "./pages/ValeMercadoPage";

type Route = "employees" | "vale-mercado";

function getRouteFromHash(): Route {
  const h = (window.location.hash || "#/employees").replace("#", "");
  if (h.startsWith("/vale-mercado")) return "vale-mercado";
  return "employees";
}

export default function Shell() {
  const [route, setRoute] = useState<Route>(() => getRouteFromHash());

  useEffect(() => {
    const onHash = () => setRoute(getRouteFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const title = useMemo(() => {
    return route === "vale-mercado" ? "Vale Mercado" : "Funcionários";
  }, [route]);

  function go(to: Route) {
    window.location.hash = to === "employees" ? "#/employees" : "#/vale-mercado";
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-title">RH • {title}</div>
          <div className="topbar-nav">
            <button className={"tab" + (route === "employees" ? " active" : "")} onClick={() => go("employees")}>
              Funcionários
            </button>
            <button className={"tab" + (route === "vale-mercado" ? " active" : "")} onClick={() => go("vale-mercado")}>
              Vale Mercado
            </button>
          </div>
        </div>
      </div>

      {route === "employees" ? <App /> : <ValeMercadoPage />}
    </div>
  );
}
