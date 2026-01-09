import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3333",
});

// --------------------
// Types (Funcionários)
// --------------------
export type Employee = {
  id: number;
  name: string;
  matricula: string;
  costCenter: string;
  branch: string;
  admissionDate: string;
  terminationDate: string | null;
};

// --------------------
// Types (Vale Mercado)
// --------------------
export type VoucherMarketAllocationStatus = "DEFAULT" | "FALTA" | "PROPORCIONAL" | "EXCLUIDO";
export type VoucherInvoiceStatus = "DRAFT" | "CLOSED";

export type VoucherMarketInvoice = {
  id: number;
  competence: string;
  invoiceNumber: string;
  invoiceValue: string;
  status: VoucherInvoiceStatus;
  closedAt: string | null;
};

export type VoucherMarketAllocation = {
  id: number;
  employeeId: number;
  amount: string;
  status: VoucherMarketAllocationStatus;
  note?: string | null;
  employee: Employee;
};

export type VoucherMarketInvoiceDetails = {
  invoice: VoucherMarketInvoice;
  baseValue: string;
  allocations: VoucherMarketAllocation[];
  totals: {
    sumAllocations: string;
    diff: string;
    company95: string;
    employees5: string;
  };
};
