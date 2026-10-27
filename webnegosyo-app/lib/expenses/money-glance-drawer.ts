/**
 * What a manager reads about a drawer's pay-outs (design plan §7): one line
 * per open drawer and per shift in history — "Expenses ₱1,480 · Taken out
 * ₱1,500" — and the shift's purchases by category instead of free text.
 * Pure; the split is `summarizeShiftPayouts`, the shift card's own.
 */

import type { CashMove } from "../cash-drawers";
import { summarizeShiftPayouts, type ShiftPayouts } from "./drawer-expenses";
import { formatCents } from "./expense-format";
import type { MovementLink } from "./expense-service";

const toCents = (pesos: number): number => Math.round(pesos * 100);
const money = (cents: number): string => formatCents(cents, { compact: true });

/**
 * "Expenses ₱1,480 · Taken out ₱1,500". Taken out = cash moved that is not
 * an expense (owner, deposit, loan) plus pickups. Null when nothing left.
 */
export function drawerSplitText(payouts: ShiftPayouts | null, collectedPesos: number): string | null {
  const takenOut = (payouts?.takenOut.cents ?? 0) + toCents(collectedPesos);
  const parts = [
    payouts && payouts.expenses.cents > 0 ? `Expenses ${money(payouts.expenses.cents)}` : null,
    takenOut > 0 ? `Taken out ${money(takenOut)}` : null,
    payouts && payouts.unsorted.cents > 0 ? `Paid out ${money(payouts.unsorted.cents)}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

type HistoryMove = Pick<CashMove, "id" | "kind" | "amount" | "reason">;
type HistoryLink = Pick<MovementLink, "categoryName" | "group" | "status">;

/**
 * "Paid for: Gas / LPG ₱1,180 · Ice (Yelo) ₱450 (2) · Rider ₱85.50" — the
 * shift's expenses by category, biggest first, then any pay-out nobody gave a
 * category, by its reason. Cash taken out sits on the split line instead.
 */
export function historyPayoutText(moves: readonly HistoryMove[], links: ReadonlyMap<string, HistoryLink>): string | null {
  const payouts = summarizeShiftPayouts(moves, links);
  const categorized = payouts.expenses.byCategory.map(
    (line) => `${line.name} ${money(line.cents)}${line.count > 1 ? ` (${line.count})` : ""}`,
  );
  const loose = moves
    .filter((move) => move.kind === "pay_out" && !links.has(move.id))
    .map((move) => `${move.reason?.trim() || "No reason given"} ${money(toCents(move.amount))}`);
  const parts = [...categorized, ...loose];
  return parts.length > 0 ? `Paid for: ${parts.join(" · ")}` : null;
}
