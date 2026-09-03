/**
 * Whether the signed-in store takes pre-orders — the config gate behind the
 * Scheduled tab. Lives apart from lib/advance-ordering.ts so the pure
 * predicate stays importable under the node test runner: this file pulls in
 * the supabase client, which only constructs inside the app runtime.
 *
 * Cached per tenant for the session: the flag changes on the order-type
 * settings screen in the web admin, not mid-shift.
 */

import { useEffect, useState } from "react";

import { hasAdvanceOrdering, type AdvanceOrderFlagRow } from "./advance-ordering";
import { supabase } from "./supabase";
import { useAuthStore } from "../stores/auth-store";

/** Whether any enabled order type of the tenant takes pre-orders. */
export async function fetchAdvanceOrdering(tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("order_types")
    .select("advance_order_enabled")
    .eq("tenant_id", tenantId)
    .eq("is_enabled", true)
    .eq("advance_order_enabled", true)
    .limit(1);

  if (error) throw error;
  return hasAdvanceOrdering((data ?? []) as AdvanceOrderFlagRow[]);
}

/** Session cache: the tab must not flicker on every layout render. */
const cache = new Map<string, boolean>();

/**
 * `false` until known — the Scheduled tab appearing a beat after login is
 * quieter than one that flashes in front of every store and then vanishes. A
 * failed read also stays `false`: hiding a tab the merchant could not load is
 * the safe direction.
 */
export function useAdvanceOrdering(): boolean {
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
    fetchAdvanceOrdering(tenantId)
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
