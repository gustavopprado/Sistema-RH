// frontend/src/services/valeRefeicaoApi.js
import { apiRequest } from "./apiClient";

// Ajuste este endpoint se no teu projeto for diferente (ex: /employees ou /funcionarios)
export function listEmployees() {
  return apiRequest("/employees");
}

export function getValeRefeicao(referenceMonth) {
  return apiRequest(`/vale-refeicao/${referenceMonth}`);
}

export function saveValeRefeicaoInvoices(referenceMonth, invoices) {
  return apiRequest(`/vale-refeicao/${referenceMonth}/invoices`, {
    method: "PUTPUT",
    method: "PUT",
    body: invoices,
  });
}

export function saveValeRefeicaoAllocations(referenceMonth, allocations) {
  return apiRequest(`/vale-refeicao/${referenceMonth}/allocations`, {
    method: "PUT",
    body: { allocations },
  });
}
