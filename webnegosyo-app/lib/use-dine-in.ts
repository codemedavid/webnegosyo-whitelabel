/**
 * Whether the signed-in store seats guests — the config gate behind the
 * Tables tab. Lives apart from lib/dine-in.ts so the pure predicate stays
 * importable under the node test runner: this file pulls in the supabase
 * client, which only constructs inside the app runtime.
 *
 * Same shape as lib/use-advance-ordering.ts, for the same reasons: cached
 * per tenant for the session (order types change on the web admin, not
 * mid-shift), `false` until known so the tab never flashes in front of a
 * counter-only store, and a failed read stays `false` because hiding a tab
 * the merchant could not load is the safe direction.
 */

import { useEffect, useState } from "react";

import { DINE_IN_ORDER_TYPE_KIND, hasDineIn, type OrderTypeKindRow } from "./dine-in";
import { supabase } from "./supabase";
import { useAuthStore } from "../stores/auth-store";

/** Whether any enabled order type of the tenant is the dine-in kind. */
export async function fetchDineIn(tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("order_types")
    .select("type")
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true)
    .eq("type", DINE_IN_ORDER_TYPE_KIND)
    .limit(1);

  if (error) throw error;
  return hasDineIn((data ?? []) as OrderTypeKindRow[]);
}

/** Session cache: the tab must not flicker on every layout render. */
const cache = new Map<string, boolean>();

export function useDineIn(): boolean {
  const tenantId = useAuthStore((s) => s.tenantId);
  const [isEnabled, setEnabled] = useState(
    () => (tenantId ? cache.get(tenantId) : undefined) ?? false,
  );

  useEffect(() => {
    if (!tenantId) {
      setEnabled(false);
      return;
    }
    const known = cache.get(tenantId);
    if (known !== undefined) {
      setEnabled(known);
      return;
    }
    let isStale = false;
    fetchDineIn(tenantId)
      .then((enabled) => {
        cache.set(tenantId, enabled);
        if (!isStale) setEnabled(enabled);
      })
      .catch(() => {
        if (!isStale) setEnabled(false);
      });
    return () => {
      isStale = true;
    };
  }, [tenantId]);

  return isEnabled;
}
