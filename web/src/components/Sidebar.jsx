// frontend/src/components/Sidebar.jsx
import React from "react";

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-title">RH • Custos</div>
        <div className="brand-sub">Gestão de benefícios</div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-btn ${active === "employees" ? "active" : ""}`}
          onClick={() => onChange("employees")}
        >
          Funcionários
        </button>

        <button
          className={`nav-btn ${active === "vale-mercado" ? "active" : ""}`}
          onClick={() => onChange("vale-mercado")}
        >
          Vale Mercado
        </button>

        <button
          className={`nav-btn ${active === "vale-refeicao" ? "active" : ""}`}
          onClick={() => onChange("vale-refeicao")}
        >
          Vale Refeição
        </button>
      </nav>

      <div className="sidebar-footer">
        <span className="muted">Admin</span>
      </div>
    </aside>
  );
}
