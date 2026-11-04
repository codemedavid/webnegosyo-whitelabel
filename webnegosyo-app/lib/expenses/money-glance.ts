/**
 * Money at a glance outside the Expenses screen (design plan §6): the Home
 * card ("Spent today", "Kept this month"), the Reports "Money" rows, and the
 * stock screen's "Paid for this delivery?" prompt. Pure: the screens only
 * place what this file words.
 *
 * Spending follows the month figure's rule (`monthSpentCents`): recorded rows
 * only, and cash merely moved (owner took cash, bank deposit, loan payment)
 * is never spending. A row whose category is unknown still counts.
 */

import { canSeeProfit } from "../profit/profit-view";
import { isTabReachable, type TabVisibilityContext } from "../tab-visibility";
import { formatCents, manilaDate } from "./expense-format";
import type { QueuedExpense } from "./expense-queue";
import type { Expense, ExpenseCategory, PaidFrom } from "./types";

export interface SpendGlance {
  cents: number;
  count: number;
  /** Of `count`, how many were paid from a drawer. */
  drawerCount: number;
}

export interface GlanceText {
  title: string;
  detail: string;
}

/** What a spending figure reads from a row, landed or still on this phone. */
interface SpendRow {
  spentOn: string;
  amountCents: number;
  categoryId: string;
  paidFrom: PaidFrom;
  /** Undefined = not known on the phone (a queued drawer pay-out: its shift decides). */
  outletId: string | null | undefined;
}

/** An expense this phone holds that the platform has not acknowledged yet. */
export interface QueuedSpend extends SpendRow {
  /** = its client_request_id, so it is never counted beside the row it became. */
  requestId: string;
}

/**
 * This phone's queued expenses as spending: refused ones are left out (they
 * will never land unless a person re-sends them), the rest count from the
 * moment they are typed — offline at the palengke included.
 */
export function queuedSpends(entries: readonly QueuedExpense[]): QueuedSpend[] {
  return entries
    .filter((entry) => entry.refusedReason === null)
    .map((entry) => {
      const { payload } = entry;
      if (payload.kind === "book") {
        const { draft } = payload;
        return { requestId: entry.id, spentOn: draft.spentOn, amountCents: draft.amountCents, categoryId: draft.categoryId, paidFrom: draft.paidFrom, outletId: draft.outletId };
      }
      return {
        requestId: entry.id,
        spentOn: manilaDate(entry.createdAt),
        amountCents: payload.input.amountCents,
        categoryId: payload.input.categoryId,
        paidFrom: "drawer" as const,
        outletId: undefined,
      };
    });
}

/**
 * One Manila day's spending. `outletId` is the branch being viewed; null =
 * every branch. A chosen branch counts only rows filed to it, the rule the
 * month figure's read (`listExpenses`) uses — except a queued drawer pay-out,
 * whose branch only its shift knows: it is this phone's own drawer, so it
 * counts. `queued` entries that already landed are counted once.
 */
export function spentOn(
  expenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
  date: string,
  outletId: string | null,
  queued: readonly QueuedSpend[] = [],
): SpendGlance {
  const notExpense = new Set(categories.filter((category) => category.group === "not_expense").map((category) => category.id));
  const landed = new Set(expenses.map((expense) => expense.clientRequestId).filter(Boolean));
  const rows: SpendRow[] = [
    ...expenses.filter((expense) => expense.status === "recorded"),
    ...queued.filter((entry) => !landed.has(entry.requestId)),
  ];
  const spending = rows.filter(
    (row) =>
      row.spentOn === date &&
      !notExpense.has(row.categoryId) &&
      (outletId === null || row.outletId === undefined || row.outletId === outletId),
  );
  return {
    cents: spending.reduce((total, row) => total + row.amountCents, 0),
    count: spending.length,
    drawerCount: spending.filter((row) => row.paidFrom === "drawer").length,
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Spent today ₱3,480" / "6 expenses · 2 from the drawer". */
export function spentTodayRow(glance: SpendGlance): GlanceText {
  const title = `Spent today ${formatCents(glance.cents, { compact: true })}`;
  if (glance.count === 0) return { title, detail: "Nothing recorded yet today" };
  const drawer = glance.drawerCount > 0 ? ` · ${glance.drawerCount} from the drawer` : "";
  return { title, detail: `${plural(glance.count, "expense", "expenses")}${drawer}` };
}

/** "₱48,230 spent in October". */
export function monthSpentDetail(cents: number, monthName: string): string {
  return `${formatCents(cents, { compact: true })} spent in ${monthName}`;
}

/** The two figures of a profit report the glance needs. */
export interface KeptSource {
  profitCents: number;
  ratios: { profit: number | null };
}

function wholePesos(cents: number): string {
  return formatCents(Math.round(Math.abs(cents) / 100) * 100, { compact: true });
}

function share(ratio: number | null): string | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  return `${Math.round(Math.abs(ratio) * 100)}%`;
}

/** "Kept this month ₱35,800" / "29% of sales · Profit"; a loss is said in words, not with a minus. */
export function keptRow(report: KeptSource): GlanceText & { isLoss: boolean } {
  if (report.profitCents < 0) {
    return {
      title: `Lost this month ${wholePesos(report.profitCents)}`,
      detail: "More went out than came in · Profit",
      isLoss: true,
    };
  }
  const percent = share(report.ratios.profit);
  return {
    title: `Kept this month ${wholePesos(report.profitCents)}`,
    detail: percent ? `${percent} of sales · Profit` : "Profit",
    isLoss: false,
  };
}

/** The Reports row's live figure: "Kept ₱35,800 · 29%". */
export function profitRowDetail(report: KeptSource): string {
  if (report.profitCents < 0) return `Lost ${wholePesos(report.profitCents)} this month`;
  const percent = share(report.ratios.profit);
  return percent ? `Kept ${wholePesos(report.profitCents)} · ${percent}` : `Kept ${wholePesos(report.profitCents)}`;
}

/** "3 pay-outs need a category"; null when none do. */
export function unsortedRow(count: number): GlanceText | null {
  if (count <= 0) return null;
  return {
    title: `${plural(count, "pay-out", "pay-outs")} ${count === 1 ? "needs" : "need"} a category`,
    detail: "Give these a category",
  };
}

/** What a stock movement told the screen once it saved. Quantity in stock units; cost in pesos per unit. */
export interface RecordedMovement {
  reason: "receive" | "stocktake" | "waste";
  quantity: number;
  /** Null when no cost was typed. */
  unitCost: number | null;
  itemName: string;
}

export interface DeliveryPrefill {
  /** Undefined = the owner types it. */
  amountCents: number | undefined;
  note: string;
}

/** After a delivery only: the expense it probably paid for, quantity × the typed unit cost. */
export function deliveryExpensePrefill(movement: RecordedMovement): DeliveryPrefill | null {
  if (movement.reason !== "receive") return null;
  const { quantity, unitCost } = movement;
  const isPriced = unitCost !== null && Number.isFinite(unitCost) && unitCost > 0 && Number.isFinite(quantity) && quantity > 0;
  const amountCents = isPriced ? Math.round(quantity * (unitCost as number) * 100) : undefined;
  return { amountCents: amountCents && amountCents > 0 ? amountCents : undefined, note: `${movement.itemName.trim()} delivery` };
}

export interface MoneyAccess {
  /** May open the expense book (the Expenses screen). */
  canSeeExpenses: boolean;
  /** May open Profit and see its figures — not only reach a locked screen. */
  canSeeProfitRow: boolean;
  /** Profit's live figure can be read: the platform's report functions. */
  canSeeKept: boolean;
}

/**
 * Who sees which money row. Never money to an account without the key. Profit
 * needs reports + expenses + costs (`canSeeProfit`); `isTabReachable` now asks
 * the same, and it is checked here too so no door into Profit can drift.
 */
export function moneyAccess(ctx: TabVisibilityContext, orderBackend: string | null): MoneyAccess {
  const canSeeProfitRow = isTabReachable("profit", ctx) && canSeeProfit(ctx.caller);
  return {
    canSeeExpenses: isTabReachable("expenses", ctx),
    canSeeProfitRow,
    canSeeKept: canSeeProfitRow && orderBackend === "platform",
  };
}
