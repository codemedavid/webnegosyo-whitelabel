/**
 * Bills to pay inside Profit (recurring-bills.md "Where it shows"), app view
 * layer only — `profit-model.ts` stays byte-identical with the web.
 *
 *  - Findings: when the store keeps bills, "Rent is due on the 5th and not
 *    marked paid" comes from the bills themselves (an open, late due date in
 *    the period), and the model's category guess ("No Rent recorded this
 *    month") is dropped. A store without bills keeps the guess.
 *  - Forecast: "If you pay the 2 bills left: about ₱20,800 kept" under this
 *    month's figure — what is left once the bills still to pay are paid.
 *
 * A bill is a reminder: none of this changes a profit figure. Pure.
 */

import type { Bill, Occurrence, StillToPay } from "../expenses/bill-schedule";
import { ordinal } from "../expenses/bill-schedule";
import type { ProfitFinding } from "./profit-model";
import type { FindingCard } from "./profit-findings";
import type { ProfitBranch } from "./profit-service";
import { formatMoney } from "./profit-view";

/** The bills a profit figure covers: a branch's own, store-wide only, or every bill. */
export function billsForBranch<T extends Pick<Bill, "outletId">>(bills: readonly T[], branch: ProfitBranch): T[] {
  if (branch.unassigned) return bills.filter((bill) => bill.outletId === null);
  if (branch.outletId) return bills.filter((bill) => bill.outletId === branch.outletId);
  return [...bills];
}

/** Whether the store keeps bills at all (a stopped one does not count). */
export function keepsBills(bills: readonly Pick<Bill, "status">[]): boolean {
  return bills.some((bill) => bill.status !== "ended");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const dayOfMonth = (date: string): number => Number(date.slice(8, 10));

function billFinding(bill: Bill, occurrence: Occurrence, dueOns: readonly string[]): FindingCard {
  const newest = dueOns[dueOns.length - 1];
  const amount =
    occurrence.amountCents === null
      ? null
      : `${occurrence.isEstimate ? "About " : ""}${formatMoney(occurrence.amountCents * dueOns.length)}`;
  const open = dueOns.length > 1 ? `${plural(dueOns.length, "payment", "payments")} still open. ` : "";
  const why = dueOns.length > 1 ? "Until they’re in, profit looks higher than it is." : "Until it’s in, profit looks higher than it is.";
  return {
    key: `bill:${bill.id}`,
    tone: "warning",
    icon: "calendar",
    title: `${bill.name} is due on the ${ordinal(dayOfMonth(newest))} and not marked paid`,
    detail: `${amount ? `${amount}. ` : ""}${open}${why}`,
    action: { kind: "bill", label: "Pay", billId: bill.id },
  };
}

/**
 * One card per bill with a late, unpaid due date inside [fromKey, toKey] —
 * oldest due date first. Snoozed and skipped dates are the owner's own
 * answer and never come back here.
 */
export function billFindingCards(
  bills: readonly Bill[],
  occurrences: readonly Occurrence[],
  range: { fromKey: string; toKey: string },
): FindingCard[] {
  const byId = new Map(bills.filter((bill) => bill.status !== "ended").map((bill) => [bill.id, bill]));
  return occurrences
    .filter((row) => row.state === "late" && byId.has(row.billId))
    .map((row) => ({ row, dueOns: row.lateDueOns.filter((dueOn) => dueOn >= range.fromKey && dueOn <= range.toKey) }))
    .filter(({ dueOns }) => dueOns.length > 0)
    .sort((a, b) => a.dueOns[0].localeCompare(b.dueOns[0]))
    .map(({ row, dueOns }) => billFinding(byId.get(row.billId) as Bill, row, dueOns));
}

export interface BillFindingsInput {
  /** The store keeps bills (`keepsBills`); false = keep the model's category guess. */
  hasBills: boolean;
  cards: readonly FindingCard[];
}

/** Bills replace the category guess; they go first, being the surest warnings. */
export function withBillFindings(
  findings: readonly ProfitFinding[],
  bills: BillFindingsInput | null,
): { findings: ProfitFinding[]; leading: FindingCard[] } {
  if (!bills?.hasBills) return { findings: [...findings], leading: [] };
  return { findings: findings.filter((finding) => finding.kind !== "missing_recurring"), leading: [...bills.cards] };
}

export interface ForecastInput {
  /** Kept so far this month (centavos; negative = a loss so far). */
  profitCents: number;
  /** Only this month, while it is still running. */
  isCurrentPartialMonth: boolean;
  still: StillToPay | null;
}

/** "If you pay the 2 bills left: about ₱20,800 kept"; null when there is nothing left to pay. */
export function billForecastLine({ profitCents, isCurrentPartialMonth, still }: ForecastInput): string | null {
  if (!isCurrentPartialMonth || !still || still.count <= 0) return null;
  const after = profitCents - still.cents;
  const money = formatMoney(Math.abs(after));
  const figure = `${still.hasEstimate ? "about " : ""}${money} ${after < 0 ? "lost" : "kept"}`;
  return `If you pay the ${plural(still.count, "bill", "bills")} left: ${figure}`;
}
