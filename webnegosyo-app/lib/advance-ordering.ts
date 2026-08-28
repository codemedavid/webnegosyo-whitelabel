/**
 * Does this store take pre-orders at all? Advance ordering has no tenant-level
 * flag — it is enabled per order type (order_types.advance_order_enabled), so
 * the answer is "any enabled order type says yes". The Scheduled tab hangs off
 * this: a merchant who never turned pre-orders on must never see a dead tab,
 * and the one who did gets it without an app update.
 *
 * Pure predicate only — the supabase read and the hook live in
 * lib/use-advance-ordering.ts so this stays importable under the node test
 * runner. Follows the platform's flag convention (strict === true; absent or
 * null reads as off — see src/lib/outlets/multi-branch-flag.ts).
 */

export interface AdvanceOrderFlagRow {
  advance_order_enabled?: boolean | null;
}

export function hasAdvanceOrdering(rows: readonly AdvanceOrderFlagRow[]): boolean {
  return rows.some((row) => row.advance_order_enabled === true);
}
