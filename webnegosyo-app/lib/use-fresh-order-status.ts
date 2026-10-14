/**
 * The hook half of `fresh-order-status.ts`: ask the store's own backend for one
 * order's current status, bounded, never throwing.
 */

import { useCallback } from "react";
import { useConvex } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";
import { resolveRefRoute } from "./backends/route";
import { runPlatformQuery, type PlatformClient } from "./backends/supabase-adapter";
import { supabase } from "./supabase";
import { fetchFreshOrderStatus } from "./fresh-order-status";
import { isOffline } from "./offline/connectivity";
import { useAccountBranchScope } from "./use-branch-scope";

const GET_ORDER_BY_ID = "orders:getOrderById";
const getOrderByIdRef = GET_ORDER_BY_ID as unknown as FunctionReference<"query">;
/** The same client the platform query layer reads with. */
const platformClient = supabase as unknown as PlatformClient;

export function useFreshOrderStatus(): (orderId: string) => Promise<string | null> {
  const convex = useConvex();
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const scope = useAccountBranchScope();

  return useCallback(
    (orderId: string) =>
      fetchFreshOrderStatus(orderId, {
        route: resolveRefRoute({ orderBackend, convexUrl, tenantId, ref: GET_ORDER_BY_ID }),
        isOffline: isOffline(),
        queryPlatform: (args) => runPlatformQuery(platformClient, tenantId ?? "", GET_ORDER_BY_ID, args, scope),
        queryConvex: (args) => convex.query(getOrderByIdRef, args),
      }),
    [convex, convexUrl, orderBackend, tenantId, scope],
  );
}
