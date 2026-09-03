/**
 * Table number resolution.
 *
 * The checkout stores the table a dine-in customer typed under
 * `customer_data.table_number` — the same key the Messenger message and cart
 * summary already read. Every merchant surface (order card, kitchen ticket,
 * receipt) resolves it through here so the value is one thing everywhere.
 *
 * Mirrored (deliberately, like `receipt-layout.ts`) in
 * `src/lib/order-table-number.ts`. Keep the two in sync.
 */

export const TABLE_NUMBER_FIELD_NAME = "table_number";

/** Leading "Table", "Tbl", "T." or "#" a customer types before the number. */
const SPOKEN_PREFIX = /^(?:table|tbl\.?|t\.)?\s*#?\s*/i;

/**
 * Canonical form of a typed table: prefix stripped, whitespace collapsed,
 * uppercased so "a3" and "A3" are the same table. Empty when nothing is left.
 */
export function normalizeTableNumber(raw: string): string {
  return raw.trim().replace(SPOKEN_PREFIX, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** The table on an order, or null when none was captured. */
export function getOrderTableNumber(customerData: unknown): string | null {
  if (typeof customerData !== "object" || customerData === null) return null;
  const raw = (customerData as Record<string, unknown>)[TABLE_NUMBER_FIELD_NAME];
  if (typeof raw !== "string") return null;
  const normalized = normalizeTableNumber(raw);
  return normalized.length > 0 ? normalized : null;
}
