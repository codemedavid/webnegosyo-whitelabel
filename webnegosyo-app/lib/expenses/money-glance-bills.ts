/**
 * Bills to pay at a glance on Home (recurring-bills.md "Where it shows"): one
 * row, and only when a bill is late or due within 3 days — "Rent is 2 days
 * late" / "Kuryente is due tomorrow", "₱15,000 · 2 more bills this week",
 * with a Pay button that opens that bill. Quiet otherwise: a calm week needs
 * no row telling the owner it is calm. Pure.
 *
 * Words stay plain: "late", never "You missed". Snoozed ("Remind me
 * tomorrow") and skipped ("Nothing to pay this time") due dates are left out.
 */

import { OPEN_STATES, paymentsOwed, type Bill, type Occurrence, type OccurrenceState } from "./bill-schedule";
import { LONG_LATE_DAYS } from "./bills-screen";
import { formatCents } from "./expense-format";
import { addDays, daysBetween } from "./manila-date";

/** A Home row only for these: late, due today, due within 3 days. */
const URGENT_STATES: ReadonlySet<OccurrenceState> = new Set(["late", "due_today", "due_soon"]);
const WEEK_DAYS = 7;

export interface BillGlance {
  billId: string;
  title: string;
  detail: string;
  isLate: boolean;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function whenWords(bill: Pick<Bill, "name" | "rule">, occurrence: Occurrence, today: string): string {
  const { name } = bill;
  if (occurrence.state === "late") {
    // The board reads ~120 days of payments: past LONG_LATE_DAYS an "about every N days" count may not be true.
    if (bill.rule.kind === "after_days" && occurrence.daysLate > LONG_LATE_DAYS) return `${name} not marked in a while`;
    return `${name} is ${plural(Math.max(1, occurrence.daysLate), "day", "days")} late`;
  }
  const ahead = daysBetween(today, occurrence.dueOn);
  if (ahead <= 0) return `${name} is due today`;
  return ahead === 1 ? `${name} is due tomorrow` : `${name} is due in ${ahead} days`;
}

/** "₱15,000", "about ₱6,200", "2 payments · ₱30,000"; null when the amount is not known yet. */
function amountWords(occurrence: Occurrence): string | null {
  const owed = paymentsOwed(occurrence);
  const payments = owed > 1 ? `${owed} payments` : null;
  if (occurrence.amountCents === null) return payments;
  const money = formatCents(occurrence.amountCents * owed, { compact: true });
  const amount = occurrence.isEstimate ? `about ${money}` : money;
  return payments ? `${payments} · ${amount}` : amount;
}

/** Other bills with a payment still open that is late or falls in the next 7 days. */
function moreThisWeek(occurrences: readonly Occurrence[], billId: string, today: string): number {
  const weekEnd = addDays(today, WEEK_DAYS - 1);
  const others = occurrences.filter(
    (row) => row.billId !== billId && row.state !== "snoozed" && OPEN_STATES.has(row.state) && (row.state === "late" || row.dueOn <= weekEnd),
  );
  return new Set(others.map((row) => row.billId)).size;
}

/**
 * The Home row for the most pressing bill (`billsDue` order: late first, then
 * due today, then due soon), or null when nothing is late or due in 3 days.
 */
export function billGlance(bills: readonly Bill[], occurrences: readonly Occurrence[], today: string): BillGlance | null {
  const billOf = new Map(bills.filter((bill) => bill.status !== "ended").map((bill) => [bill.id, bill]));
  const urgent = occurrences.find((row) => URGENT_STATES.has(row.state) && billOf.has(row.billId));
  if (!urgent) return null;
  const more = moreThisWeek(occurrences.filter((row) => billOf.has(row.billId)), urgent.billId, today);
  const parts = [amountWords(urgent) ?? "Amount changes each time", more > 0 ? `${plural(more, "more bill", "more bills")} this week` : null];
  return {
    billId: urgent.billId,
    title: whenWords(billOf.get(urgent.billId) as Bill, urgent, today),
    detail: parts.filter((part): part is string => part !== null).join(" · "),
    isLate: urgent.state === "late",
  };
}
