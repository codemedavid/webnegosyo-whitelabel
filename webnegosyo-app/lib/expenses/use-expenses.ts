/**
 * Expense reads on the shared cache, and the device queue as React state.
 *
 * Keys carry the tenant id, so the tenant-switch teardown drops them. The
 * categories and the recent rows are snapshotted on the phone: the drawer's
 * "Pay an expense" must open in a dead zone, and the chips come from them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";

import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { hasPermission } from "../staff-permissions";
import { liveExpenseDb } from "./expense-client";
import { manilaToday } from "./expense-format";
import type { QueuedExpense } from "./expense-queue";
import {
  getExpense,
  listCategories,
  listExpenses,
  listRecentExpenses,
  listUnsortedPayouts,
  storeTracksStock,
  type ExpenseDetail,
  type ExpenseMonth,
} from "./expense-service";
import { pendingExpenses, pendingReceipts, subscribeExpenseQueue } from "./live-expense-queue";
import { addDays } from "./manila-date";
import type { QueuedReceipt } from "./receipt-queue";
import type { Expense, ExpenseCategory, UnsortedPayout } from "./types";

export const EXPENSE_CATEGORIES_RESOURCE = "expense-categories";
export const EXPENSE_MONTH_RESOURCE = "expense-month";
export const EXPENSE_RECENT_RESOURCE = "expense-recent";
export const EXPENSE_DETAIL_RESOURCE = "expense-detail";
export const EXPENSE_UNSORTED_RESOURCE = "expense-unsorted";
export const EXPENSE_TRACKS_STOCK_RESOURCE = "expense-tracks-stock";

const CATEGORIES_STALE_MS = 5 * 60_000;
const LIST_STALE_MS = 30_000;
const RECENT_WINDOW_DAYS = 60;

const NO_CATEGORIES: ExpenseCategory[] = [];
const NO_EXPENSES: Expense[] = [];

/** The store this person acts for (impersonation included). */
export function useExpenseTenant(): string | null {
  return useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
}

/** May open the expense book, fix, void and sort (`expenses`). Cashiers pay from the drawer without it. */
export function useCanManageExpenses(): boolean {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  return hasPermission({ role, isOwner, permissions }, "expenses");
}

/** The branch a new expense belongs to: a branch account's own, else the chosen one, else store-wide. */
export function useExpenseOutlet(): string | null {
  const accountOutlet = useAuthStore((s) => s.outletId);
  const selected = useBranchContextStore((s) => s.selectedOutletId);
  return accountOutlet ?? selected ?? null;
}

export function useExpenseCategories() {
  const tenantId = useExpenseTenant();
  const fetcher = useCallback(() => listCategories(liveExpenseDb, tenantId as string), [tenantId]);
  const result = useResource<ExpenseCategory[]>(
    tenantId ? resourceKey(EXPENSE_CATEGORIES_RESOURCE, tenantId) : null,
    fetcher,
    { staleTime: CATEGORIES_STALE_MS, offlineSnapshot: true },
  );
  return { ...result, categories: result.data ?? NO_CATEGORIES };
}

/** The last 60 days (bounded): repeat chips and "most used". */
export function useRecentExpenses(enabled = true) {
  const tenantId = useExpenseTenant();
  const fetcher = useCallback(
    () => listRecentExpenses(liveExpenseDb, tenantId as string, addDays(manilaToday(), -RECENT_WINDOW_DAYS)),
    [tenantId],
  );
  const result = useResource<Expense[]>(
    tenantId && enabled ? resourceKey(EXPENSE_RECENT_RESOURCE, tenantId) : null,
    fetcher,
    { staleTime: LIST_STALE_MS, offlineSnapshot: true },
  );
  return { ...result, expenses: result.data ?? NO_EXPENSES };
}

export function useTracksStock(): boolean {
  const tenantId = useExpenseTenant();
  const fetcher = useCallback(() => storeTracksStock(liveExpenseDb, tenantId as string), [tenantId]);
  const result = useResource<boolean>(
    tenantId ? resourceKey(EXPENSE_TRACKS_STOCK_RESOURCE, tenantId) : null,
    fetcher,
    { staleTime: 30 * 60_000, offlineSnapshot: true },
  );
  return result.data === true;
}

export function useExpenseMonth(month: string, outletId: string | null | undefined) {
  const tenantId = useExpenseTenant();
  const fetcher = useCallback(
    () => listExpenses(liveExpenseDb, { tenantId: tenantId as string, month, outletId }),
    [tenantId, month, outletId],
  );
  const result = useResource<ExpenseMonth>(
    tenantId ? resourceKey(EXPENSE_MONTH_RESOURCE, tenantId, month, outletId ?? "all") : null,
    fetcher,
    { staleTime: LIST_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: tenantId !== null,
    staleMs: LIST_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });
  return result;
}

export function useUnsortedPayouts(enabled: boolean) {
  const tenantId = useExpenseTenant();
  const fetcher = useCallback(() => listUnsortedPayouts(liveExpenseDb, tenantId as string), [tenantId]);
  const result = useResource<UnsortedPayout[]>(
    tenantId && enabled ? resourceKey(EXPENSE_UNSORTED_RESOURCE, tenantId) : null,
    fetcher,
    { staleTime: LIST_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: tenantId !== null && enabled,
    staleMs: LIST_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });
  return { ...result, payouts: result.data ?? [] };
}

export function useExpenseDetail(expenseId: string | null) {
  const tenantId = useExpenseTenant();
  const fetcher = useCallback(
    () => getExpense(liveExpenseDb, tenantId as string, expenseId as string),
    [tenantId, expenseId],
  );
  const result = useResource<ExpenseDetail | null>(
    tenantId && expenseId ? resourceKey(EXPENSE_DETAIL_RESOURCE, tenantId, expenseId) : null,
    fetcher,
    { staleTime: LIST_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: tenantId !== null && expenseId !== null,
    staleMs: LIST_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });
  return result;
}

/** Re-read everything expenses show after a write or a sync. */
export function invalidateExpenses(client: QueryClient, tenantId: string | null): Promise<void> {
  return Promise.all(
    [EXPENSE_MONTH_RESOURCE, EXPENSE_RECENT_RESOURCE, EXPENSE_DETAIL_RESOURCE, EXPENSE_UNSORTED_RESOURCE].map((name) =>
      invalidateResource(client, name, tenantId),
    ),
  ).then(() => undefined);
}

/** `invalidateExpenses` for screens: they never import TanStack themselves (query-layer-wiring). */
export function useInvalidateExpenses(): () => Promise<void> {
  const client = useQueryClient();
  const tenantId = useExpenseTenant();
  return useCallback(() => invalidateExpenses(client, tenantId), [client, tenantId]);
}

export interface DeviceQueue {
  expenses: QueuedExpense[];
  receipts: QueuedReceipt[];
  /** Request ids with a receipt still on this phone. */
  waitingReceipts: ReadonlySet<string>;
}

const EMPTY_QUEUE: DeviceQueue = { expenses: [], receipts: [], waitingReceipts: new Set() };

/** What this phone still holds for the store, re-read whenever the queue changes. */
export function useDeviceExpenseQueue(): DeviceQueue {
  const tenantId = useExpenseTenant();
  const [queue, setQueue] = useState<DeviceQueue>(EMPTY_QUEUE);

  useEffect(() => {
    if (!tenantId) {
      setQueue(EMPTY_QUEUE);
      return;
    }
    let isActive = true;
    const read = () => {
      void Promise.all([pendingExpenses(tenantId), pendingReceipts(tenantId)]).then(([expenses, receipts]) => {
        if (!isActive) return;
        setQueue({ expenses, receipts, waitingReceipts: new Set(receipts.map((receipt) => receipt.clientRequestId)) });
      });
    };
    read();
    const unsubscribe = subscribeExpenseQueue(read);
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [tenantId]);

  return queue;
}

/** Categories by id, memoised. */
export function useCategoryIndex(categories: readonly ExpenseCategory[]): Map<string, ExpenseCategory> {
  return useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
}
