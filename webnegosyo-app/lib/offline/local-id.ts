/**
 * Ids minted on the device for sales taken while offline.
 *
 * A UUID v4 rather than a `pos-…` token because the platform database keeps
 * the id the register printed: the order row is inserted with this exact id at
 * sync time, so the receipt in the customer's hand, the kitchen chit and the
 * order in the admin list all agree. (Convex assigns its own ids and cannot
 * take one, so a Convex store's synced order carries a different id from the
 * paper — see `lib/offline/sync-outbox.ts`.)
 *
 * Math.random is enough here: the id only has to be unique on this device
 * until the sale syncs, and the database's primary key rejects a collision
 * rather than merging two sales.
 */

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hexByte(): string {
  return Math.floor(Math.random() * 256)
    .toString(16)
    .padStart(2, "0");
}

export function newLocalOrderId(): string {
  const bytes = Array.from({ length: 16 }, hexByte);
  // Version nibble and variant bits, so the id is a well-formed v4.
  bytes[6] = "4" + bytes[6][1];
  bytes[8] = ["8", "9", "a", "b"][Math.floor(Math.random() * 4)] + bytes[8][1];
  const hex = bytes.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isLocalOrderId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}
