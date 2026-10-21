/**
 * What left a drawer as pay-outs, told apart by what each pay-out was for.
 *
 * Since expenses, every drawer pay-out is either an expense ("Paid for
 * expenses ₱1,450 (3)"), cash taken out that is not an expense (owner took
 * cash, bank deposit, loan payment), or an old free-text pay-out nobody has
 * sorted yet. The shift card and the close summary read this one split, so
 * the two can never disagree. An expense voided on an open shift had its
 * cash put back by a pay-in (contract §5), so its pay-out is shown as undone
 * rather than spent — the pay-in line beside it nets it out. Pure.
 */

import type { CashMove } from "../cash-drawers";
import { formatPeso } from "./keypad";
import type { MovementLink } from "./expense-service";

export interface PayoutBucket {
  cents: number;
  count: number;
}

export interface ShiftPayouts {
  expenses: PayoutBucket & { byCategory: { name: string; cents: number; count: number }[] };
  takenOut: PayoutBucket;
  unsorted: PayoutBucket;
  undone: PayoutBucket;
}

const EMPTY_BUCKET: PayoutBucket = { cents: 0, count: 0 };

function add(bucket: PayoutBucket, cents: number): PayoutBucket {
  return { cents: bucket.cents + cents, count: bucket.count + 1 };
}

export function summarizeShiftPayouts(
  moves: readonly Pick<CashMove, "id" | "kind" | "amount">[],
  links: ReadonlyMap<string, Pick<MovementLink, "categoryName" | "group" | "status">>,
): ShiftPayouts {
  let expenses = EMPTY_BUCKET;
  let takenOut = EMPTY_BUCKET;
  let unsorted = EMPTY_BUCKET;
  let undone = EMPTY_BUCKET;
  const byCategory = new Map<string, { name: string; cents: number; count: number }>();
  for (const move of moves) {
    if (move.kind !== "pay_out") continue;
    const cents = Math.round(move.amount * 100);
    const link = links.get(move.id);
    if (!link) {
      unsorted = add(unsorted, cents);
    } else if (link.status === "void") {
      undone = add(undone, cents);
    } else if (link.group === "not_expense") {
      takenOut = add(takenOut, cents);
    } else {
      expenses = add(expenses, cents);
      const name = link.categoryName ?? "Other";
      const previous = byCategory.get(name) ?? { name, cents: 0, count: 0 };
      byCategory.set(name, { name, cents: previous.cents + cents, count: previous.count + 1 });
    }
  }
  return {
    expenses: { ...expenses, byCategory: [...byCategory.values()].sort((a, b) => b.cents - a.cents) },
    takenOut,
    unsorted,
    undone,
  };
}

/** The card's lines, in pesos text: only the buckets that hold something. */
export function payoutLines(payouts: ShiftPayouts): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  if (payouts.expenses.count > 0) {
    lines.push({ label: `Paid for expenses (${payouts.expenses.count})`, value: `−${formatPeso(payouts.expenses.cents)}` });
  }
  if (payouts.takenOut.count > 0) {
    lines.push({ label: `Cash taken out (${payouts.takenOut.count})`, value: `−${formatPeso(payouts.takenOut.cents)}` });
  }
  if (payouts.unsorted.count > 0) {
    lines.push({ label: `Paid out (${payouts.unsorted.count})`, value: `−${formatPeso(payouts.unsorted.cents)}` });
  }
  if (payouts.undone.count > 0) {
    // Its pay-in is on the "Paid in" line; both are shown so the sum still reads.
    lines.push({ label: `Expenses undone (${payouts.undone.count})`, value: `−${formatPeso(payouts.undone.cents)}` });
  }
  return lines;
}

/** One sentence for the close summary: "Paid for expenses ₱1,450 (3): LPG ₱1,250, Ice ₱200." */
export function describeShiftExpenses(payouts: ShiftPayouts): string | null {
  const { expenses, takenOut } = payouts;
  const parts: string[] = [];
  if (expenses.count > 0) {
    const detail = expenses.byCategory
      .slice(0, 3)
      .map((line) => `${line.name.replace(/\s*\(.*\)\s*$/, "")} ${formatPeso(line.cents)}`)
      .join(", ");
    parts.push(`Paid for expenses ${formatPeso(expenses.cents)} (${expenses.count})${detail ? `: ${detail}` : ""}.`);
  }
  if (takenOut.count > 0) parts.push(`Cash taken out ${formatPeso(takenOut.cents)} (${takenOut.count}).`);
  return parts.length > 0 ? parts.join(" ") : null;
}
