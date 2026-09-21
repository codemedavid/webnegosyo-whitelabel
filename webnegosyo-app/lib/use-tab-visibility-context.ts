import { useMemo } from "react";

import { useAuthStore } from "../stores/auth-store";
import type { TabVisibilityContext } from "./tab-visibility";
import { useAdvanceOrdering } from "./use-advance-ordering";
import { usePortfolioAudience } from "./use-portfolio-audience";

/**
 * The three gates every "can this account see this screen?" question needs,
 * gathered once. The tab bar, both hubs, the sub-screen doors and Home's
 * quick actions all read this so they cannot disagree about what exists.
 *
 * Memoised on its inputs: the object is the identity the tab tree's options
 * are compared on, and a fresh one every render would re-register every tab.
 */
export function useTabVisibilityContext(): TabVisibilityContext {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const audience = usePortfolioAudience();
  const takesAdvanceOrders = useAdvanceOrdering();

  return useMemo(
    () => ({ caller: { role, isOwner, permissions }, audience, takesAdvanceOrders }),
    [role, isOwner, permissions, audience, takesAdvanceOrders],
  );
}
