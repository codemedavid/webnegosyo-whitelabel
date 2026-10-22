/**
 * The bills behind Profit's warnings and its "If you pay the N bills left"
 * line (lib/profit/profit-bills.ts), for the branch the figure covers. Reads
 * the shared bills board; null pieces while it is not known.
 */

import { useMemo } from "react";

import { monthKeyOf, stillToPay, type StillToPay } from "../expenses/bill-schedule";
import { useBillOccurrences } from "../expenses/use-bill-glance";
import { billFindingCards, billsForBranch, keepsBills, type BillFindingsInput } from "./profit-bills";
import type { ProfitBranch } from "./profit-service";

export interface ProfitBills {
  /** Null until the bills are read: the category guess stays meanwhile. */
  findings: BillFindingsInput | null;
  /** This month's bills still to pay (only meaningful for the month in progress). */
  still: StillToPay | null;
}

export function useProfitBills(isEnabled: boolean, branch: ProfitBranch, range: { fromKey: string; toKey: string }): ProfitBills {
  const read = useBillOccurrences(isEnabled);
  const { outletId, unassigned } = branch;
  const { fromKey, toKey } = range;
  return useMemo(() => {
    if (!read) return { findings: null, still: null };
    const bills = billsForBranch(read.bills, { outletId, unassigned });
    const ids = new Set(bills.map((bill) => bill.id));
    const occurrences = read.occurrences.filter((row) => ids.has(row.billId));
    return {
      findings: { hasBills: keepsBills(bills), cards: billFindingCards(bills, occurrences, { fromKey, toKey }) },
      still: stillToPay(occurrences, monthKeyOf(read.today)),
    };
  }, [read, outletId, unassigned, fromKey, toKey]);
}
