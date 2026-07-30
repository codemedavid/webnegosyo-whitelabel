/**
 * The reasons a stock movement can carry.
 *
 * A local declaration rather than a reuse of `lib/inventory-movement.ts`, whose
 * `ManualMovementReason` lists only the three a merchant enters BY HAND. The
 * report reads the whole ledger, and `sale` and `void` are the two the system
 * writes for itself — a report blind to them would show a day of pure
 * deliveries and grade it immaculate.
 *
 * `parity.test.ts` asserts this list against `StockMovementReason` in
 * `src/lib/inventory/stock-ledger.ts`, so it cannot silently fall behind the
 * web ledger.
 */
export const MOVEMENT_REASONS = ["receive", "stocktake", "waste", "sale", "void"] as const;

export type StockMovementReason = (typeof MOVEMENT_REASONS)[number];
