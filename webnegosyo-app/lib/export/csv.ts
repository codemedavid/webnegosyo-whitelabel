/**
 * CSV serialization for merchant data exports.
 *
 * Pure string building only — no filesystem, no share sheet — so every
 * escaping rule is unit-testable. The rules exist for two audiences:
 *
 * - **Excel.** Files open double-clicked, not imported, so the output leads
 *   with a UTF-8 BOM (₱ and Filipino names garble without it) and rows join
 *   with CRLF per RFC 4180.
 * - **Attackers.** A customer can name themselves `=HYPERLINK(...)` at
 *   checkout. Any string cell starting with `=`, `+`, `-`, or `@` is prefixed
 *   with an apostrophe so spreadsheets render it as text instead of executing
 *   it. Numbers the app computed itself are exempt: a `-50` discount is data,
 *   not input.
 */

export type CsvValue = string | number | boolean | null | undefined;

/** Byte-order mark Excel needs to detect UTF-8 in a double-clicked CSV. */
export const CSV_BOM = "\uFEFF";

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_LEAD = /^[=+\-@]/;

/** One cell, escaped and (when string) formula-guarded. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
  if (!NEEDS_QUOTING.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** A complete CSV document: BOM, header row, then data rows, CRLF-joined. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[]
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return CSV_BOM + lines.join("\r\n");
}
