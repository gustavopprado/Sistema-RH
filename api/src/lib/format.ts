export function parseDateFlexible(value: string): Date {
  // Aceita "YYYY-MM-DD" ou "YYYYMMDD"
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + "T00:00:00");
    if (Number.isNaN(d.getTime())) throw new Error("Data inválida");
    return d;
  }
  if (/^\d{8}$/.test(v)) {
    const yyyy = v.slice(0, 4);
    const mm = v.slice(4, 6);
    const dd = v.slice(6, 8);
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    if (Number.isNaN(d.getTime())) throw new Error("Data inválida");
    return d;
  }
  throw new Error("Formato de data inválido. Use YYYY-MM-DD ou YYYYMMDD.");
}

export function normalizeName(name: string): string {
  // Remove espaços duplicados e trim
  return name.replace(/\s+/g, " ").trim();
}

export function normalizeSimple(value: string): string {
  return value.trim();
}