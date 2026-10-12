/**
 * Everything the app's Senior & PWD screen shows, computed from the raw rows
 * in one pure step so the screen only lays it out.
 */

import { GOV_DISCOUNT_KINDS, type GovDiscountKind } from "../gov-discount";
import { kindLabel } from "./format";
import { cashierAttribution, grantsWithStatus, groupTotals, sumClaims } from "./netting";
import { needsALook } from "./review-queue";
import type { GrantEntry, GroupTotals, LedgerClaim, LedgerReview, MoneyTotals, ReversalStamp } from "./types";

export interface GovReportInput {
  rows: readonly LedgerClaim[];
  laterReversals: readonly ReversalStamp[];
  reviews: readonly LedgerReview[];
}

export interface GovReport {
  /** Net of reversals. */
  totals: MoneyTotals;
  /** How many grants in the window were later taken back. */
  reversedCount: number;
  byKind: GroupTotals[];
  byCashier: GroupTotals[];
  /** Every grant in the window, newest first. */
  grants: GrantEntry[];
  needsALook: GrantEntry[];
}

const kindRank = (key: string): number => GOV_DISCOUNT_KINDS.indexOf(key as GovDiscountKind);

export function buildGovReport({ rows, laterReversals, reviews }: GovReportInput): GovReport {
  const grants = grantsWithStatus(rows, laterReversals, reviews);
  return {
    totals: sumClaims(rows),
    reversedCount: grants.filter((grant) => grant.reversedAt !== null).length,
    byKind: groupTotals(rows, (row) => row.kind, (key) => kindLabel(key as GovDiscountKind)).sort(
      (a, b) => kindRank(a.key) - kindRank(b.key),
    ),
    byCashier: groupTotals(rows, cashierAttribution(rows), (key) => key),
    grants,
    needsALook: needsALook(grants),
  };
}
