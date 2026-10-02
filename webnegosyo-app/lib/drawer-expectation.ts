/**
 * What one open drawer should hold right now — for the cashier's own card
 * and for every row of the owner's floor view, by ONE function so the two can
 * never disagree about the same till.
 *
 * Sales come from shift-drawer.ts (cashier + window), cash moves from
 * shift_cash_movements, the arithmetic from shift.ts. Pure.
 */

import { summarizeCashMoves, type CashMove, type CashMoveTotals } from "./cash-drawers";
import { isShiftHistoryComplete, reconcileShift, type ShiftReconciliation } from "./shift";
import { summarizeShiftDrawer, type StaffPayment } from "./shift-drawer";
import type { CounterSale, CounterSalesSummary } from "./pos-sales";
import type { ShiftRecord } from "./shift-service";

export const INCOMPLETE_HISTORY_MESSAGE =
  "More orders were rung up since this shift started than this screen reads, so it can't be reconciled here.";

export interface DrawerExpectation {
  summary: CounterSalesSummary;
  moves: CashMoveTotals;
  reconciliation: ShiftReconciliation;
}

export type DrawerExpectationRead =
  | { state: "ready"; value: DrawerExpectation }
  | { state: "loading" }
  | { state: "unavailable"; reason: string };

export interface ExpectationSources {
  orders: readonly CounterSale[];
  payments: readonly StaffPayment[];
  /** Newest-first page size the orders were read with. */
  pageLimit: number;
  ledgerReady: boolean;
  ledgerError: string | null;
  /** Null while the moves are still loading; an error is reported by the caller. */
  moves: readonly CashMove[] | null;
  nowMs: number;
}

export function expectDrawer(shift: ShiftRecord, sources: ExpectationSources): DrawerExpectationRead {
  if (sources.ledgerError) return { state: "unavailable", reason: sources.ledgerError };
  if (!isShiftHistoryComplete(sources.orders, sources.pageLimit, shift.openedAt)) {
    return { state: "unavailable", reason: INCOMPLETE_HISTORY_MESSAGE };
  }
  if (!sources.ledgerReady || sources.moves === null) return { state: "loading" };

  const summary = summarizeShiftDrawer(
    sources.orders,
    sources.payments,
    {
      outletId: shift.outletId,
      // A removed account's sales can no longer be attributed — match nothing
      // rather than everything.
      staffUserId: shift.staffUserId ?? "",
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
    },
    sources.nowMs,
  );
  const moves = summarizeCashMoves(sources.moves.filter((m) => m.shiftId === shift.id));
  return {
    state: "ready",
    value: {
      summary,
      moves,
      reconciliation: reconcileShift({
        openingFloat: shift.openingFloat,
        cashCollected: summary.cashTotal,
        moves,
        isZeroBalance: shift.isZeroBalance,
      }),
    },
  };
}
