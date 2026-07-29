import { useCallback, useEffect, useState } from "react";

import { supabase } from "./supabase";
import { useAuthStore } from "../stores/auth-store";
import { useBranchContextStore } from "../stores/branch-context-store";
import type { PortfolioOutlet } from "./portfolio-rows";

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
 */
export interface OutletsResult {
  outlets: PortfolioOutlet[];
  /** True until the first response, success or failure. */
  isLoading: boolean;
  /** A message fit to show a merchant, or null. */
  error: string | null;
  reload: () => void;
}

export function useOutlets(): OutletsResult {
  const tenantId = useAuthStore((s) => s.tenantId);
  const setKnownOutlets = useBranchContextStore((s) => s.setKnownOutlets);

  const [outlets, setOutlets] = useState<PortfolioOutlet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // A branch belongs to one store, so the branch being viewed cannot outlive
  // the tenant it belongs to: signing out (tenantId → null) or a superadmin
  // opening a different store must both drop it. Keyed on the tenant alone, so
  // a pull-to-refresh does not throw the merchant back to the whole store.
  useEffect(() => {
    useBranchContextStore.getState().clear();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setOutlets([]);
      setIsLoading(false);
      return;
    }

    // Guards a response that arrives after the tenant changed — an owner
    // signing out and a superadmin opening a different store both do that.
    let isCurrent = true;
    setIsLoading(true);

    void (async () => {
      const { data, error: queryError } = await supabase
        .from("outlets")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");

      if (!isCurrent) return;

      if (queryError) {
        setError("Could not load your branches");
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as PortfolioOutlet[];
      setOutlets(rows);
      setKnownOutlets(rows);
      setError(null);
      setIsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [tenantId, reloadToken, setKnownOutlets]);

  return { outlets, isLoading, error, reload };
}
