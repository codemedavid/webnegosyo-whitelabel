/**
 * The machine kind that marks an order type as seating guests. Dine-in has no
 * tenant-level flag — it is an order type of kind `dine_in`
 * (`order_types.type`), and the register reads it to decide whether a sale
 * may carry a table (`lib/pos-table.ts`).
 *
 * Match the kind, never the merchant's label, which they rename freely (see
 * src/lib/outlets/mode-order-type.ts for the same rule).
 *
 * The Tables floor plan does NOT hang off this: a store that takes only
 * delivery online still seats people, so the floor is gated on the `tables`
 * grant alone (`lib/tab-visibility.ts`).
 */

export const DINE_IN_ORDER_TYPE_KIND = "dine_in";
