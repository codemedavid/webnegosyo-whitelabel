/**
 * What the Drawer needs to know about expenses: whether "Pay an expense" can
 * run here (the store has categories — a store whose database predates
 * expenses keeps the old free-text pay out), what this phone still holds for
 * a shift, and which of the shift's pay-outs were expenses.
 *
 * One hook so the shift card asks once, and its tests can stand it in.
 */

import { useCallback, useMemo } from "react";

import type { CashMove } from "../cash-drawers";
import { resourceKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import { liveExpenseDb } from "./expense-client";
import { pendingDrawerCents, refusedDrawerPayouts, type RefusedPayout } from "./expense-queue";
import { listMovementLinks, type MovementLink } from "./expense-service";
import { summarizeShiftPayouts, type ShiftPayouts } from "./drawer-expenses";
import {
  dismissQueuedExpense,
  readPendingExpensesOrThrow,
  retryQueuedExpenses,
  retryRefusedExpense,
} from "./live-expense-queue";
import { useDeviceExpenseQueue, useExpenseCategories, useExpenseTenant } from "./use-expenses";

export const SHIFT_LINKS_RESOURCE = "expense-shift-links";

/** What this phone still holds for a shift once it tried to send it all. */
export interface SettleResult {
  /** Still on their way (offline): the drawer must not close yet. */
  waiting: number;
  /** The store did not take them: shown on the close sheet to retry or remove. */
  refused: number;
}

export interface DrawerExpenses {
  /** "Pay an expense" and "Take out cash" can run: categories are loaded. */
  isReady: boolean;
  /**
   * Drawer expenses on this phone still on their way to the server for a
   * shift. Refused ones are not counted: they never send by themselves.
   */
  pendingFor: (shiftId: string) => { cents: number; count: number; waiting: number };
  /** Drawer pay-outs of a shift the store did not take, for the cashier to retry or remove. */
  refusedFor: (shiftId: string) => RefusedPayout[];
  /** Try again on one refused pay-out. Never throws. */
  retryRefused: (id: string) => Promise<void>;
  /** Remove one refused pay-out from this phone. Never throws. */
  removeRefused: (id: string) => Promise<void>;
  /** The shift's pay-outs split into expenses / taken out / unsorted / undone. */
  payouts: ShiftPayouts | null;
  reloadPayouts: () => Promise<void>;
  /**
   * Send what this phone holds for the store, then say what of this shift is
   * still on the phone — a drawer must not be counted while cash that left
   * it is not on the server yet. THROWS when the phone cannot read or write
   * its queue: the close must stop, never assume "nothing waiting".
   */
  settleBeforeClose: (shiftId: string) => Promise<SettleResult>;
}

const NO_LINKS = new Map<string, MovementLink>();

export function useDrawerExpenses(shiftId: string | null, moves: readonly CashMove[]): DrawerExpenses {
  const tenantId = useExpenseTenant();
  const { categories } = useExpenseCategories();
  const queue = useDeviceExpenseQueue();

  const payoutIds = useMemo(
    () => moves.filter((move) => move.shiftId === shiftId && move.kind === "pay_out").map((move) => move.id),
    [moves, shiftId],
  );
  const fetcher = useCallback(() => listMovementLinks(liveExpenseDb, tenantId as string, payoutIds), [tenantId, payoutIds]);
  const links = useResource<Map<string, MovementLink>>(
    tenantId && shiftId && payoutIds.length > 0 ? resourceKey(SHIFT_LINKS_RESOURCE, tenantId, shiftId, payoutIds.join(",")) : null,
    fetcher,
    { staleTime: 15_000 },
  );

  const shiftMoves = useMemo(() => moves.filter((move) => move.shiftId === shiftId), [moves, shiftId]);
  const payouts = useMemo(
    () => (shiftId && (payoutIds.length === 0 || links.data) ? summarizeShiftPayouts(shiftMoves, links.data ?? NO_LINKS) : null),
    [shiftId, payoutIds.length, links.data, shiftMoves],
  );

  const pendingFor = useCallback(
    (id: string) => {
      const sum = pendingDrawerCents(queue.expenses, id);
      return { ...sum, waiting: sum.count };
    },
    [queue.expenses],
  );

  const refusedFor = useCallback((id: string) => refusedDrawerPayouts(queue.expenses, id), [queue.expenses]);

  const reloadLinks = links.refetch;
  const retryRefused = useCallback(
    async (id: string) => {
      if (!tenantId) return;
      const result = await retryRefusedExpense(tenantId, id);
      if (result.sent.size > 0) await reloadLinks();
    },
    [tenantId, reloadLinks],
  );

  const removeRefused = useCallback(async (id: string) => {
    await dismissQueuedExpense(id);
  }, []);

  const settleBeforeClose = useCallback(
    async (id: string): Promise<SettleResult> => {
      if (!tenantId) throw new Error("No store is signed in on this phone.");
      // Ends any Undo window too: the cashier is closing, not undoing.
      await retryQueuedExpenses(tenantId);
      const left = await readPendingExpensesOrThrow(tenantId);
      return { waiting: pendingDrawerCents(left, id).count, refused: refusedDrawerPayouts(left, id).length };
    },
    [tenantId],
  );

  return {
    isReady: categories.length > 0,
    pendingFor,
    refusedFor,
    retryRefused,
    removeRefused,
    payouts,
    reloadPayouts: links.refetch,
    settleBeforeClose,
  };
}
