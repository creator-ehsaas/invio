// CSV helpers with formula-injection defense (RFC 4180 quoting).
// A cell beginning with = + - @ TAB or CR can be interpreted as a formula
// by Excel/Sheets; prefix it with an apostrophe to defang. Embedded double
// quotes are doubled to keep the field well-formed.
export function csvCell(value: unknown): string {
  const s = String(value ?? "");
  const defanged = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${defanged.replace(/"/g, '""')}"`;
}

export function toCSV(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
