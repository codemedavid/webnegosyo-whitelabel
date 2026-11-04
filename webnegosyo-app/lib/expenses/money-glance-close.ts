/**
 * The close-shift sheet's words (design plan §7, screen 07): what the drawer
 * should hold built line by line, the drawer's expenses by name, and the
 * count stated plainly. Pure.
 *
 * Nothing here re-derives the drawer: the total is the reconciliation's own
 * `expectedInDrawer` (lib/shift.ts), and the lines are the terms of that same
 * sum — float + cash sales + pay-ins − pay-outs − pickups — with the pay-outs
 * split by `summarizeShiftPayouts`, the shift card's own split. So the lines
 * always add up to the figure the count is judged against.
 */

import { summarizeCashMoves, type CashMove, type CashMoveTotals } from "../cash-drawers";
import { judgeCount, type ShiftReconciliation } from "../shift";
import { shortCategoryName } from "./category-look";
import { describeShiftExpenses, summarizeShiftPayouts, type ShiftPayouts } from "./drawer-expenses";
import { formatCents, manilaClock } from "./expense-format";
import type { MovementLink } from "./expense-service";

export interface CloseLine {
  key: string;
  label: string;
  /** Always ≥ 0; the sign says which way it moved the drawer. */
  cents: number;
  sign: "" | "+" | "-";
}

export interface CloseLinesInput {
  openingFloat: number;
  /** Net cash this shift took, pesos. */
  cashSales: number;
  moves: CashMoveTotals;
  /** The pay-outs told apart; null = not known, shown as one "Paid out" line. */
  payouts: ShiftPayouts | null;
  /** The reconciliation's figure, pesos. */
  expectedInDrawer: number;
}

const toCents = (pesos: number): number => Math.round(pesos * 100);

function payoutLines(input: CloseLinesInput): CloseLine[] {
  const { payouts, moves } = input;
  if (!payouts) {
    const lines: CloseLine[] = [];
    if (moves.payOut > 0) lines.push({ key: "paid-out", label: "Paid out", cents: toCents(moves.payOut), sign: "-" });
    if (moves.collected > 0) lines.push({ key: "taken-out", label: "Cash taken out", cents: toCents(moves.collected), sign: "-" });
    return lines;
  }
  const takenOutCents = payouts.takenOut.cents + toCents(moves.collected);
  const candidates: (CloseLine | null)[] = [
    payouts.expenses.count > 0
      ? { key: "expenses", label: `Paid for expenses · ${payouts.expenses.count}`, cents: payouts.expenses.cents, sign: "-" }
      : null,
    takenOutCents > 0 ? { key: "taken-out", label: "Cash taken out", cents: takenOutCents, sign: "-" } : null,
    payouts.unsorted.count > 0
      ? { key: "paid-out", label: `Paid out · ${payouts.unsorted.count}`, cents: payouts.unsorted.cents, sign: "-" }
      : null,
    // Its pay-in is on "Cash put in"; both are shown so the sum still reads.
    payouts.undone.count > 0
      ? { key: "undone", label: `Expenses undone · ${payouts.undone.count}`, cents: payouts.undone.cents, sign: "-" }
      : null,
  ];
  return candidates.filter((line): line is CloseLine => line !== null);
}

export function closeShiftLines(input: CloseLinesInput): { lines: CloseLine[]; totalCents: number } {
  const lines: CloseLine[] = [
    { key: "start", label: "Starting cash", cents: toCents(input.openingFloat), sign: "" },
    { key: "sales", label: "Cash sales", cents: toCents(input.cashSales), sign: "+" },
    ...(input.moves.payIn > 0 ? [{ key: "in", label: "Cash put in", cents: toCents(input.moves.payIn), sign: "+" as const }] : []),
    ...payoutLines(input),
  ];
  return { lines, totalCents: toCents(input.expectedInDrawer) };
}

export interface DrawerExpenseItem {
  key: string;
  categoryId: string;
  /** "LPG 11kg", or "Yelo · 2 times" for repeats. */
  title: string;
  /** "10:12 AM" / "11:30 AM, 3:05 PM". */
  detail: string;
  cents: number;
  count: number;
}

type ItemMove = Pick<CashMove, "id" | "kind" | "amount" | "reason" | "createdAt">;
type ItemLink = Pick<MovementLink, "categoryId" | "categoryName" | "group" | "status">;

function baseTitle(move: ItemMove, link: ItemLink): string {
  const reason = move.reason?.trim() ?? "";
  if (reason === "" || reason === link.categoryName) return shortCategoryName(link.categoryName ?? "Expense");
  return reason;
}

/**
 * What the drawer paid for, oldest first: recorded expenses only (cash taken
 * out and undone expenses are lines above, not things bought). The same
 * thing bought twice is one row, "Yelo · 2 times".
 */
export function drawerExpenseItems(moves: readonly ItemMove[], links: ReadonlyMap<string, ItemLink>): DrawerExpenseItem[] {
  const groups = new Map<string, { categoryId: string; title: string; times: string[]; cents: number; first: string }>();
  for (const move of moves) {
    const link = links.get(move.id);
    if (move.kind !== "pay_out" || !link || link.status !== "recorded" || link.group === "not_expense") continue;
    const title = baseTitle(move, link);
    const key = `${link.categoryId}|${move.reason?.trim() || link.categoryName || ""}`;
    const previous = groups.get(key);
    groups.set(key, {
      categoryId: link.categoryId,
      title,
      times: [...(previous?.times ?? []), manilaClock(move.createdAt)],
      cents: (previous?.cents ?? 0) + toCents(move.amount),
      first: previous && previous.first < move.createdAt ? previous.first : move.createdAt,
    });
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0))
    .map(([key, group]) => ({
      key,
      categoryId: group.categoryId,
      title: group.times.length > 1 ? `${group.title} · ${group.times.length} times` : group.title,
      detail: group.times.filter((time) => time !== "").join(", "),
      cents: group.cents,
      count: group.times.length,
    }));
}

export interface CountVerdict {
  kind: "short" | "over" | "exact";
  /** "₱120 short", "₱50 over", "Exact". */
  text: string;
}

/** The count against the drawer, by the same judge the close records (`judgeCount`). */
export function countVerdict(expectedInDrawer: number, counted: number): CountVerdict {
  const { verdict, variance } = judgeCount(expectedInDrawer, 0, counted);
  if (verdict === "balanced") return { kind: "exact", text: "Exact" };
  const amount = formatCents(toCents(Math.abs(variance)), { compact: true });
  return verdict === "short" ? { kind: "short", text: `${amount} short` } : { kind: "over", text: `${amount} over` };
}

/** "Hand over ₱2,640 and leave ₱2,000 in the drawer for the next shift." — what the old close pop-up said. */
export function handOverText(input: { counted: number; floatToKeep: number; isZeroBalance: boolean }): string {
  const countedCents = Math.max(0, toCents(input.counted));
  if (input.isZeroBalance) return `Hand over all ${formatCents(countedCents, { compact: true })}. This drawer ends empty.`;
  const keepCents = Math.min(toCents(input.floatToKeep), countedCents);
  const handOver = formatCents(countedCents - keepCents, { compact: true });
  return `Hand over ${handOver} and leave ${formatCents(keepCents, { compact: true })} in the drawer for the next shift.`;
}

/** Everything the close sheet shows, frozen when the count was entered — what "End shift" saves. */
export interface CloseReview {
  shiftId: string;
  title: string;
  subtitle: string;
  lines: readonly CloseLine[];
  totalCents: number;
  items: readonly DrawerExpenseItem[];
  countedCents: number;
  verdict: CountVerdict;
  /** "The owner will see this on the shift." / "Saved on Ana's shift." */
  verdictNote: string;
  handOver: string;
  /** The pop-up title once the close lands: "Shift ended" / "Ana's shift closed". */
  doneTitle: string;
  /** "Paid for expenses ₱1,480 (3): …"; null when nothing was paid out or it could not be read. */
  expensesLine: string | null;
}

export interface CloseReviewInput {
  shift: { id: string; staffName: string; drawerName: string | null; openingFloat: number; isZeroBalance: boolean };
  isMine: boolean;
  /** Net cash this shift took, pesos (the expectation's own summary). */
  cashSales: number;
  /** The shift's moves, read fresh just before. */
  moves: readonly CashMove[];
  /** Which pay-outs were expenses; null when they could not be read. */
  links: ReadonlyMap<string, MovementLink> | null;
  reconciliation: ShiftReconciliation;
  counted: number;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function closeReview(input: CloseReviewInput): CloseReview {
  const { shift, reconciliation, counted } = input;
  const shiftMoves = input.moves.filter((move) => move.shiftId === shift.id);
  const totals = summarizeCashMoves(shiftMoves);
  const payouts = input.links ? summarizeShiftPayouts(shiftMoves, input.links) : null;
  const { lines, totalCents } = closeShiftLines({
    openingFloat: shift.openingFloat,
    cashSales: input.cashSales,
    moves: totals,
    payouts,
    expectedInDrawer: reconciliation.expectedInDrawer,
  });
  const who = firstName(shift.staffName);
  return {
    shiftId: shift.id,
    title: input.isMine ? "End your shift" : `End ${who}'s shift`,
    subtitle: `${shift.drawerName ?? "Personal drawer"}${shift.isZeroBalance ? " · Zero balance" : ""}`,
    lines,
    totalCents,
    items: input.links ? drawerExpenseItems(shiftMoves, input.links) : [],
    countedCents: toCents(counted),
    verdict: countVerdict(reconciliation.expectedInDrawer, counted),
    verdictNote: input.isMine ? "The owner will see this on the shift." : `Saved on ${who}'s shift.`,
    handOver: handOverText({ counted, floatToKeep: reconciliation.floatToKeep, isZeroBalance: shift.isZeroBalance }),
    doneTitle: input.isMine ? "Shift ended" : `${who}'s shift closed`,
    expensesLine: payouts ? describeShiftExpenses(payouts) : null,
  };
}

/**
 * Whether the drawer's figure moved between the count and "End shift" — a
 * pickup or pay-in recorded on another tablet meanwhile. Compared in whole
 * centavos so float noise in the pesos never reads as a change.
 */
export function hasDrawerChanged(countedAgainst: number, now: number): boolean {
  return toCents(countedAgainst) !== toCents(now);
}

/** The short pop-up once the close landed: "Shift ended" / "Counted ₱4,640 · ₱120 short" (+ the expenses line). */
export function closedConfirmation(review: CloseReview): { title: string; message: string } {
  const counted = `Counted ${formatCents(review.countedCents, { compact: true })} · ${review.verdict.text}`;
  return { title: review.doneTitle, message: review.expensesLine ? `${counted}\n\n${review.expensesLine}` : counted };
}
