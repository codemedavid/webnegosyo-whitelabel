/**
 * Profit on the shared cache, read as the signed-in user. Keyed on tenant,
 * window and branch, so a period chip re-reads and the tenant-switch
 * teardown drops it; re-read on focus when stale (an expense recorded on the
 * Drawer should show here when the owner comes back). A passing failure is
 * thrown (`settleProfit`) so a failed refresh keeps the figures on screen.
 *
 * The key holds the window's DAYS, never its end: a running period ends at
 * "now", which moves every render. The fetcher re-asks `windowAt` instead, so
 * a focus or pull refresh includes sales up to the moment it runs.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "../../stores/auth-store";
import { resourceKey, type ResourceQueryKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { supabase } from "../supabase";
import { windowAt, type ProfitWindow } from "./profit-period";
import { settleProfit } from "./profit-screen-state";
import {
  anyExpenseRecorded,
  glanceOf,
  readProfit,
  readProfitGlance,
  type ProfitBranch,
  type ProfitGlance,
  type ProfitGlanceData,
  type ProfitRpcClient,
  type ProfitScreenData,
} from "./profit-service";

export const PROFIT_RESOURCE = "profit";
const PROFIT_STALE_MS = 60_000;
/** Shares PROFIT_RESOURCE's name so `invalidateExpenses` refreshes glances too. */
const GLANCE_PART = "glance";

const liveProfitClient: ProfitRpcClient = {
  rpc: (fn, args) => supabase.rpc(fn, args),
};

type WindowDays = Pick<ProfitWindow, "fromKey" | "toKey">;

export function profitKey(tenantId: string, w: WindowDays, branch: ProfitBranch): ResourceQueryKey {
  return resourceKey(PROFIT_RESOURCE, tenantId, w.fromKey, w.toKey, branch.outletId ?? "all", branch.unassigned);
}

export function profitGlanceKey(tenantId: string, w: WindowDays, branch: ProfitBranch): ResourceQueryKey {
  return resourceKey(PROFIT_RESOURCE, tenantId, GLANCE_PART, w.fromKey, w.toKey, branch.outletId ?? "all", branch.unassigned);
}

function useTenantId(): string | null {
  return useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
}

export function useProfit(w: ProfitWindow, branch: ProfitBranch, isEnabled: boolean) {
  const tenantId = useTenantId();
  const fetcher = useCallback(
    async () =>
      settleProfit(
        await readProfit(
          liveProfitClient,
          windowAt(w, Date.now()),
          { tenantId: tenantId as string, branch },
          { hasAnyExpense: () => anyExpenseRecorded(supabase, tenantId as string) },
        ),
      ),
    // The window's identity changes every render ("so far" moves with now);
    // its days decide what is read, and `windowAt` supplies the end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, w.fromKey, w.toKey, w.preset, branch.outletId, branch.unassigned],
  );
  const result = useResource<ProfitScreenData>(
    tenantId && isEnabled ? profitKey(tenantId, w, branch) : null,
    fetcher,
    { staleTime: PROFIT_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: tenantId !== null && isEnabled,
    staleMs: PROFIT_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });
  return result;
}

/** What the cache holds for a full Profit read (TanStack's query state, the part this reads). */
export interface CachedProfit {
  data: unknown;
  dataUpdatedAt: number;
  isInvalidated: boolean;
}

/** A full Profit read still fresh enough to stand in for a glance; null otherwise. Pure. */
export function glanceFromProfitCache(cached: CachedProfit | undefined, w: Pick<ProfitWindow, "isPartial">, nowMs: number): ProfitGlance | null {
  if (!cached || cached.isInvalidated || nowMs - cached.dataUpdatedAt > PROFIT_STALE_MS) return null;
  const data = cached.data as ProfitScreenData | undefined;
  return data?.status === "ready" ? glanceOf(data.report, w) : null;
}

function settleGlance(result: ProfitGlanceData): ProfitGlanceData {
  if (result.status === "failed") throw new Error(result.message);
  return result;
}

/**
 * What a glance (Home "Kept this month", the Reports Money row, the Expenses
 * hero) shows: the Profit screen's own read when it is in the cache and fresh,
 * else ONE summary RPC — never Profit's four on every focus of Home. Null while
 * loading, when refused, or when it could not be read: a glance hides quietly.
 */
export function useProfitGlance(w: ProfitWindow, branch: ProfitBranch, isEnabled: boolean): ProfitGlance | null {
  const tenantId = useTenantId();
  const client = useQueryClient();
  const state = tenantId && isEnabled ? client.getQueryState(profitKey(tenantId, w, branch)) : undefined;
  const fromProfit = glanceFromProfitCache(
    state ? { data: state.data, dataUpdatedAt: state.dataUpdatedAt, isInvalidated: state.isInvalidated } : undefined,
    w,
    Date.now(),
  );
  const fetcher = useCallback(
    async () => settleGlance(await readProfitGlance(liveProfitClient, windowAt(w, Date.now()), { tenantId: tenantId as string, branch })),
    // As useProfit: the days decide the read, `windowAt` the end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, w.fromKey, w.toKey, w.preset, branch.outletId, branch.unassigned],
  );
  const isReading = tenantId !== null && isEnabled && fromProfit === null;
  const result = useResource<ProfitGlanceData>(isReading ? profitGlanceKey(tenantId as string, w, branch) : null, fetcher, {
    staleTime: PROFIT_STALE_MS,
  });
  useRefetchOnScreenFocus({
    enabled: isReading,
    staleMs: PROFIT_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });
  if (!isEnabled) return null;
  if (fromProfit) return fromProfit;
  return result.data?.status === "ready" ? result.data.glance : null;
}
