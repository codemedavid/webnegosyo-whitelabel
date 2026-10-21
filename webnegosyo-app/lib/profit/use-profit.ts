/**
 * Profit on the shared cache, read as the signed-in user. Keyed on tenant,
 * window and branch, so a period chip re-reads and the tenant-switch
 * teardown drops it; re-read on focus when stale (an expense recorded on the
 * Drawer should show here when the owner comes back).
 */

import { useCallback } from "react";

import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { supabase } from "../supabase";
import type { ProfitWindow } from "./profit-period";
import { readProfit, type ProfitBranch, type ProfitRpcClient, type ProfitScreenData } from "./profit-service";

export const PROFIT_RESOURCE = "profit";
const PROFIT_STALE_MS = 60_000;

const liveProfitClient: ProfitRpcClient = {
  rpc: (fn, args) => supabase.rpc(fn, args),
};

export function useProfit(w: ProfitWindow, branch: ProfitBranch, isEnabled: boolean) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const fetcher = useCallback(
    () => readProfit(liveProfitClient, w, { tenantId: tenantId as string, branch }),
    // The window's identity changes every render ("so far" moves with now);
    // its first and last day decide what is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, w.fromKey, w.toKey, w.preset, branch.outletId, branch.unassigned],
  );
  const result = useResource<ProfitScreenData>(
    tenantId && isEnabled
      ? resourceKey(PROFIT_RESOURCE, tenantId, w.fromKey, w.toKey, branch.outletId ?? "all", branch.unassigned)
      : null,
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
