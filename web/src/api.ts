import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3333"
});

export type Employee = {
  id: number;
  name: string;
  matricula: string;
  costCenter: string;
  branch: string;
  admissionDate: string;   // ISO
  terminationDate: string | null; // ISO or null
};