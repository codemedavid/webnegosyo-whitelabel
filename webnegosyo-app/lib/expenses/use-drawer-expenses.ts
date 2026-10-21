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
import { pendingDrawerCents } from "./expense-queue";
import { listMovementLinks, type MovementLink } from "./expense-service";
import { summarizeShiftPayouts, type ShiftPayouts } from "./drawer-expenses";
import { pendingExpenses, retryQueuedExpenses } from "./live-expense-queue";
import { useDeviceExpenseQueue, useExpenseCategories, useExpenseTenant } from "./use-expenses";

export const SHIFT_LINKS_RESOURCE = "expense-shift-links";

export interface DrawerExpenses {
  /** "Pay an expense" and "Take out cash" can run: categories are loaded. */
  isReady: boolean;
  /** Waiting (and refused) drawer expenses on this phone for a shift. */
  pendingFor: (shiftId: string) => { cents: number; count: number; waiting: number };
  /** The shift's pay-outs split into expenses / taken out / unsorted / undone. */
  payouts: ShiftPayouts | null;
  reloadPayouts: () => Promise<void>;
  /**
   * Send what this phone holds for the store, then say how many of this
   * shift's drawer expenses are still waiting — a drawer must not be counted
   * while cash that left it is not on the server yet.
   */
  settleBeforeClose: (shiftId: string) => Promise<number>;
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
      const waiting = queue.expenses.filter(
        (entry) => entry.payload.kind === "drawer" && entry.payload.input.shiftId === id && entry.refusedReason === null,
      ).length;
      return { ...sum, waiting };
    },
    [queue.expenses],
  );

  const settleBeforeClose = useCallback(
    async (id: string) => {
      if (!tenantId) return 0;
      // Ends any Undo window too: the cashier is closing, not undoing.
      await retryQueuedExpenses(tenantId);
      const left = await pendingExpenses(tenantId);
      return left.filter(
        (entry) => entry.payload.kind === "drawer" && entry.payload.input.shiftId === id && entry.refusedReason === null,
      ).length;
    },
    [tenantId],
  );

  return { isReady: categories.length > 0, pendingFor, payouts, reloadPayouts: links.refetch, settleBeforeClose };
}
