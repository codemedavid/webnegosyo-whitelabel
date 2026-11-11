/**
 * "Bills to pay" reads on the shared cache (bills-contract §4).
 *
 * Keys carry the tenant (the tenant-switch teardown drops them), the branch
 * filter and Manila's today (a new day re-reads, so "Due today" never goes
 * stale overnight). `invalidateExpenses` refreshes the board too: saving or
 * voiding an expense can pay or free a due date.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";

import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { withPendingPayments } from "./bills-screen-pending";
import { readBillBoard, type BillBoard, type BillOutletFilter } from "./bills-service";
import { liveExpenseDb } from "./expense-client";
import { manilaToday } from "./expense-format";
// Read at call time only: use-expenses imports this module too (EXPENSE_BILLS_RESOURCE).
import { useDeviceExpenseQueue, useExpenseTenant } from "./use-expenses";

export const EXPENSE_BILLS_RESOURCE = "expense-bills";

const BOARD_STALE_MS = 30_000;
const NO_BOARD: BillBoard = { bills: [], marks: [], payments: [] };

/**
 * The bills, their marks and their payments around today. `outletId`:
 * undefined = every bill the caller reaches (RLS), null = store-wide bills
 * only, a uuid = that branch. `enabled: false` reads nothing.
 *
 * `data` / `board` include this phone's bill payments still waiting to send
 * (queued, in the Undo window, offline) as provisional payments, so a second
 * "Mark paid" moves on to the next due date and no late reminder fires for a
 * bill already paid here (`bills-screen-pending.ts`).
 */
export function useBillBoard(outletId?: BillOutletFilter, enabled = true) {
  const tenantId = useExpenseTenant();
  const today = manilaToday();
  const fetcher = useCallback(
    () => readBillBoard(liveExpenseDb, tenantId as string, today, outletId),
    [tenantId, today, outletId],
  );
  const result = useResource<BillBoard>(
    tenantId && enabled ? resourceKey(EXPENSE_BILLS_RESOURCE, tenantId, outletId === undefined ? "all" : (outletId ?? "store"), today) : null,
    fetcher,
    { staleTime: BOARD_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: tenantId !== null && enabled,
    staleMs: BOARD_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });
  const queue = useDeviceExpenseQueue();
  const data = useMemo(
    () => (result.data ? withPendingPayments(result.data, queue.expenses) : undefined),
    [result.data, queue.expenses],
  );
  return { ...result, data, board: data ?? NO_BOARD, today };
}

/** Re-read the board after a bill-only write (add, edit, pause, mark). */
export function invalidateBills(client: QueryClient, tenantId: string | null): Promise<void> {
  return invalidateResource(client, EXPENSE_BILLS_RESOURCE, tenantId);
}

/** `invalidateBills` for screens. A write that touches an expense uses `useInvalidateExpenses` instead. */
export function useInvalidateBills(): () => Promise<void> {
  const client = useQueryClient();
  const tenantId = useExpenseTenant();
  return useCallback(() => invalidateBills(client, tenantId), [client, tenantId]);
}
