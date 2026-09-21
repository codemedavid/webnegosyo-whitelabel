import { useCallback, useEffect } from "react";

import { supabase } from "./supabase";
import { useAuthStore } from "../stores/auth-store";
import { useBranchContextStore } from "../stores/branch-context-store";
import { resourceKey } from "./backends/query-keys";
import { useResource } from "./query/use-resource";
import type { PortfolioOutlet } from "./portfolio-rows";

/** Cache name shared by every `useOutlets` caller; see `invalidateResource`. */
export const OUTLETS_RESOURCE = "outlets";

/** Branches change rarely; a tab switch within this window reads the cache. */
const OUTLETS_STALE_MS = 60_000;

const NO_OUTLETS: PortfolioOutlet[] = [];

/**
 * The store's own branches.
 *
 * Branches live in the platform Supabase for every tenant regardless of which
 * database serves their orders, so this reads Supabase directly rather than
 * going through the order-backend dispatch in `hooks.ts`.
 *
 * Loading them also publishes their ids to the branch-context store, which is
 * what lets `resolveEffectiveScope` reject a selection this store does not
 * have — a branch deleted while it was being viewed, or an id left behind by
 * another account on a shared device.
 *
 * Six screens call this at once; the shared cache makes that one read.
 */
export interface OutletsResult {
  outlets: PortfolioOutlet[];
  /** True until the first response, success or failure. */
  isLoading: boolean;
  /** A message fit to show a merchant, or null. */
  error: string | null;
  reload: () => void;
  /** `reload`, awaitable — for pull-to-refresh. */
  refetch: () => Promise<void>;
}

export async function fetchOutlets(tenantId: string): Promise<PortfolioOutlet[]> {
  const { data, error } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error("Could not load your branches");
  return (data ?? []) as PortfolioOutlet[];
}

export function useOutlets(): OutletsResult {
  const tenantId = useAuthStore((s) => s.tenantId);
  const setKnownOutlets = useBranchContextStore((s) => s.setKnownOutlets);

  // A branch belongs to one store, so the branch being viewed cannot outlive
  // the tenant it belongs to: signing out (tenantId → null) or a superadmin
  // opening a different store must both drop it. Keyed on the tenant alone, so
  // a pull-to-refresh does not throw the merchant back to the whole store.
  useEffect(() => {
    // This hook has multiple mounted consumers. A new consumer in the same
    // tenant must not erase the branch selected on another screen.
    useBranchContextStore.getState().bindTenant(tenantId);
  }, [tenantId]);

  const fetcher = useCallback(() => fetchOutlets(tenantId as string), [tenantId]);
  const resource = useResource<PortfolioOutlet[]>(
    tenantId ? resourceKey(OUTLETS_RESOURCE, tenantId) : null,
    fetcher,
    // Branch landing and the register's branch pick both wait on this read;
    // without a snapshot an offline launch had no branch to sell from.
    { staleTime: OUTLETS_STALE_MS, offlineSnapshot: true }
  );

  const outlets = resource.data ?? NO_OUTLETS;

  // Published from the cached rows, so a screen mounting into an already
  // loaded cache still registers the ids (the fetcher may never run for it).
  useEffect(() => {
    if (resource.data) setKnownOutlets(resource.data);
  }, [resource.data, setKnownOutlets]);

  const { refetch } = resource;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    outlets,
    isLoading: resource.isLoading,
    error: resource.error,
    reload,
    refetch,
  };
}
