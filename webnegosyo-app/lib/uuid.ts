/**
 * The guard between an id a screen is holding and a Postgres `uuid` column.
 *
 * Ids reach this app from three places and only one of them is a uuid: platform
 * rows are uuids, Convex documents are opaque strings like
 * `js71q9w4ja9g3ryvap69b9xxms8e3fzs`, and a screen that lost its argument sends
 * `undefined`. supabase-js serialises whatever it is handed straight into the
 * query string, so `id=eq.undefined` reaches Postgres and comes back as
 * `invalid input syntax for type uuid` (22P02) — which `unwrap` re-throws
 * verbatim onto a cashier's screen, or, mid-edit, refuses one write out of four.
 *
 * The web app carries the same guard at `src/lib/uuid.ts`. Deliberately copied
 * rather than imported: the merchant app is a separate Expo project with its own
 * bundler and no path into `src/`.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can be compared against, or written to, a `uuid` column. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * The value for a NULLABLE uuid column, or null.
 *
 * Null is the honest write, not a fallback: `order_items.menu_item_id` is
 * `references menu_items(id) on delete set null`, so a line whose product was
 * deleted is ALREADY null in the database. Storing null for an id this app
 * cannot express records the same fact, and — unlike a refusal — it leaves the
 * order editable.
 */
export function toUuidOrNull(value: unknown): string | null {
  return isUuid(value) ? value : null;
}
