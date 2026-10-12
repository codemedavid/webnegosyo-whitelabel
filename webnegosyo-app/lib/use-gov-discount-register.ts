/**
 * Puts the store's Senior/PWD rules where the register prices from.
 *
 * Mounted once by the register screen: it loads the tax profile (offline
 * snapshot included), derives which menu items the owner excluded from the
 * catalog the register already sells from, publishes both to the context
 * store, and sends any sales-book records still waiting on this device.
 */

import { useEffect } from "react";
import { useTaxProfile } from "./query/use-tax-profile";
import { excludedMenuItemIds } from "./tax-profile-service";
import type { RegisterItem } from "./query/use-pos-catalog";
import { useGovDiscountContextStore } from "../stores/gov-discount-context-store";

export function useGovDiscountRegister(tenantId: string | null, items: readonly RegisterItem[]): void {
  const profile = useTaxProfile(tenantId);
  const setProfile = useGovDiscountContextStore((s) => s.setProfile);
  const setExcluded = useGovDiscountContextStore((s) => s.setExcludedMenuItemIds);

  useEffect(() => {
    if (!tenantId || profile.isLoading || profile.data === undefined) return;
    setProfile(tenantId, profile.data);
  }, [tenantId, profile.isLoading, profile.data, setProfile]);

  useEffect(() => {
    setExcluded(excludedMenuItemIds(items));
  }, [items, setExcluded]);

  useEffect(() => {
    if (!tenantId) return;
    // Records saved while offline, or before a crash, go out on the next open.
    import("./gov-ledger/live-ledger")
      .then(({ liveGovLedger }) => liveGovLedger().flush())
      .catch(() => undefined);
  }, [tenantId]);
}
