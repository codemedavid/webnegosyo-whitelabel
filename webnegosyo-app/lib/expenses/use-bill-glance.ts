/**
 * Bills to pay as other screens see them: Home's "Rent is 2 days late" row,
 * the "If you pay the N bills left" line, Profit's bill findings. All read the
 * ONE board cache entry `BillReminderSync` keeps warm (every bill the account
 * reaches, today's Manila date), so none of them adds a database read.
 *
 * Quiet on failure, like the other glances: no board = no row.
 */

import { useMemo } from "react";

import { billsDue, monthKeyOf, stillToPay, type Bill, type Occurrence, type StillToPay } from "./bill-schedule";
import { billGlance, type BillGlance } from "./money-glance-bills";
import { useBillBoard } from "./use-bills";
import { billsForBranch } from "../profit/profit-bills";
import type { ProfitBranch } from "../profit/profit-service";

export interface BillOccurrences {
  bills: Bill[];
  occurrences: Occurrence[];
  today: string;
}

/** Every bill's occurrences around today; null until read (or when disabled). */
export function useBillOccurrences(isEnabled: boolean): BillOccurrences | null {
  const { data, today } = useBillBoard(undefined, isEnabled);
  return useMemo(() => {
    if (!isEnabled || !data) return null;
    const occurrences = billsDue(data.bills, { today, payments: data.payments, marks: data.marks });
    return { bills: data.bills, occurrences, today };
  }, [isEnabled, data, today]);
}

/** Home's bill row: only when a bill is late or due within 3 days. */
export function useBillGlance(isEnabled: boolean): BillGlance | null {
  const read = useBillOccurrences(isEnabled);
  return useMemo(() => (read ? billGlance(read.bills, read.occurrences, read.today) : null), [read]);
}

/** What the bills of `branch` still ask for this month (late ones included). */
export function useBillsStillToPay(isEnabled: boolean, branch: ProfitBranch): StillToPay | null {
  const read = useBillOccurrences(isEnabled);
  const { outletId, unassigned } = branch;
  return useMemo(() => {
    if (!read) return null;
    const ids = new Set(billsForBranch(read.bills, { outletId, unassigned }).map((bill) => bill.id));
    return stillToPay(read.occurrences.filter((row) => ids.has(row.billId)), monthKeyOf(read.today));
  }, [read, outletId, unassigned]);
}
