// frontend/src/layout/AppShell.jsx
import React from "react";
import Sidebar from "../components/Sidebar";

export default function AppShell({ active, onChange, children }) {
  return (
    <div className="app-shell">
      <Sidebar active={active} onChange={onChange} />
      <main className="main">{children}</main>
    </div>
  );
}
