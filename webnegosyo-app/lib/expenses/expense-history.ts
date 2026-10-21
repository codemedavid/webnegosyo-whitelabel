/**
 * The detail screen's History (plan §5.2): "Recorded by Ana from Cashier 1
 * drawer · Voided: wrong category · Replaced by …". Built from the row and its
 * neighbours in the fix chain, oldest first. Pure.
 */

import { PAID_FROM_LABELS, dayLabel, manilaClock, manilaDate } from "./expense-format";
import type { ExpenseDetail } from "./expense-service";

export interface HistoryLine {
  key: string;
  text: string;
  when: string | null;
  /** The other row in a fix chain, to open. */
  linkExpenseId: string | null;
}

function when(iso: string | null, now: number): string | null {
  if (!iso) return null;
  return `${dayLabel(manilaDate(Date.parse(iso)), now)}, ${manilaClock(iso)}`;
}

export function expenseHistory(detail: ExpenseDetail, now: number = Date.now()): HistoryLine[] {
  const { expense, replaces, replacedBy, drawer } = detail;
  const source =
    expense.paidFrom === "drawer"
      ? `from the ${drawer?.drawerName ?? "cash"} drawer`
      : `from ${PAID_FROM_LABELS[expense.paidFrom]}`;
  const lines: HistoryLine[] = [];
  if (replaces) {
    lines.push({
      key: "replaces",
      text: `Fixes an earlier entry${replaces.voidReason ? ` (${replaces.voidReason})` : ""}`,
      when: when(replaces.voidedAt, now),
      linkExpenseId: replaces.id,
    });
  }
  lines.push({
    key: "recorded",
    text: `Recorded by ${expense.createdByName} ${source}`,
    when: when(expense.createdAt, now),
    linkExpenseId: null,
  });
  if (expense.status === "void") {
    lines.push({
      key: "voided",
      text: `Voided${expense.voidReason ? `: ${expense.voidReason}` : ""}`,
      when: when(expense.voidedAt, now),
      linkExpenseId: null,
    });
  }
  if (replacedBy) {
    lines.push({ key: "replacedBy", text: "Replaced by a corrected entry", when: when(replacedBy.createdAt, now), linkExpenseId: replacedBy.id });
  }
  return lines;
}
