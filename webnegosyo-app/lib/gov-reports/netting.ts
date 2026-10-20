/**
 * Netting grants against their reversals.
 *
 * A reversal is the twin of a grant: same (backend, order, revision,
 * claimant), same amounts, recorded when an edit or a cancellation took the
 * discount back. Sums are signed and land on the day each row was recorded — a
 * grant on the 3rd reversed on the 5th adds on the 3rd and subtracts on the
 * 5th, exactly like the printed book. Arithmetic is in whole centavos so a
 * month of ₱0.01s cannot drift.
 */

import { sortFlags, type GovFlag } from "../gov-discount";
import type { GrantEntry, GroupTotals, LedgerClaim, LedgerReview, MoneyTotals, ReversalStamp } from "./types";

const AMOUNT_FIELDS = ["grossShare", "vatRemoved", "vatExemptSales", "discount", "netDue", "reduction"] as const;
type AmountField = (typeof AMOUNT_FIELDS)[number];

export const ZERO_TOTALS: MoneyTotals = {
  sales: 0,
  grossShare: 0,
  vatRemoved: 0,
  vatExemptSales: 0,
  discount: 0,
  netDue: 0,
  reduction: 0,
};

type TwinKeyed = Pick<ReversalStamp, "backend" | "externalOrderId" | "revision" | "claimantRef">;

/** The key a grant and its reversal share. */
export function twinKey(row: TwinKeyed): string {
  return `${row.backend}|${row.externalOrderId}|${row.revision}|${row.claimantRef}`;
}

/** +1 for a grant, −1 for its reversal. */
export function signOf(row: Pick<LedgerClaim, "event">): 1 | -1 {
  return row.event === "reversed" ? -1 : 1;
}

const toCents = (pesos: number): number => Math.round(pesos * 100);

/**
 * Rows bucketed by key, in first-seen order. The map is built here and handed
 * back fresh, so filling it in place is safe — and keeps a 5,000-row month
 * linear instead of copying a bucket per row.
 */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function sumClaims(rows: readonly LedgerClaim[]): MoneyTotals {
  const centsOf = (field: AmountField): number =>
    rows.reduce((sum, row) => sum + signOf(row) * toCents(row[field]), 0);
  const sales = rows.reduce((count, row) => count + signOf(row), 0);
  const pesos = Object.fromEntries(AMOUNT_FIELDS.map((field) => [field, centsOf(field) / 100])) as Record<
    AmountField,
    number
  >;
  return { sales, ...pesos };
}

/**
 * Totals per group, largest amount taken off first. Groups that net to nothing
 * (a grant and its reversal) are kept: the owner should still see that the
 * cashier touched the discount.
 */
export function groupTotals(
  rows: readonly LedgerClaim[],
  keyOf: (row: LedgerClaim) => string,
  labelOf: (key: string) => string,
): GroupTotals[] {
  const groups = groupBy(rows, keyOf);
  return [...groups.entries()]
    .map(([key, members]) => ({ key, label: labelOf(key), totals: sumClaims(members) }))
    .sort((a, b) => b.totals.reduction - a.totals.reduction || a.label.localeCompare(b.label));
}

/**
 * Who a row belongs to for the "by cashier" view. A reversal is charged to the
 * cashier who GAVE the discount when that grant is in the same window, so one
 * cashier's corrected mistake does not read as another's negative sales.
 */
export function cashierAttribution(rows: readonly LedgerClaim[]): (row: LedgerClaim) => string {
  const granter = new Map(
    rows.filter((row) => row.event === "granted").map((row) => [twinKey(row), row.grantedByName] as const),
  );
  return (row) => (row.event === "reversed" ? granter.get(twinKey(row)) ?? row.grantedByName : row.grantedByName);
}

/** Reviews grouped per claim, newest first. */
export function reviewsByClaim(reviews: readonly LedgerReview[]): Map<string, LedgerReview[]> {
  const grouped = groupBy(reviews, (review) => review.claimId);
  return new Map(
    [...grouped.entries()].map(([claimId, list]) => [
      claimId,
      [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ]),
  );
}

/**
 * Every grant in the window, newest first, each marked with when (if ever) it
 * was reversed. Reversals are looked for in the window AND after it, so last
 * month's grant cancelled this morning still shows as reversed.
 */
export function grantsWithStatus(
  windowRows: readonly LedgerClaim[],
  laterReversals: readonly ReversalStamp[],
  reviews: readonly LedgerReview[],
): GrantEntry[] {
  const stamps: ReversalStamp[] = [...windowRows.filter((row) => row.event === "reversed"), ...laterReversals];
  // Built locally and never shared, so filling it in place copies nothing per row.
  const reversedAt = new Map<string, string>();
  const reversalFlags = new Map<string, GovFlag[]>();
  for (const stamp of stamps) {
    const key = twinKey(stamp);
    const known = reversedAt.get(key);
    if (known === undefined || stamp.occurredAt < known) reversedAt.set(key, stamp.occurredAt);
    if (stamp.flags && stamp.flags.length > 0) reversalFlags.set(key, [...(reversalFlags.get(key) ?? []), ...stamp.flags]);
  }
  const reviewMap = reviewsByClaim(reviews);
  return windowRows
    .filter((row) => row.event === "granted")
    .map((row) => ({
      ...row,
      // A take-back the server could not confirm is the GRANT's problem: its
      // flag rides on the grant so the review queue and the chips see it.
      flags: sortFlags([...row.flags, ...(reversalFlags.get(twinKey(row)) ?? [])]),
      reversedAt: reversedAt.get(twinKey(row)) ?? null,
      reviews: reviewMap.get(row.id) ?? [],
    }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
}
