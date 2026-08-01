import { useMemo } from "react";

import type { PortfolioAudience } from "./portfolio-landing";
import { useAccountBranchScope } from "./use-branch-scope";
import { useAuthStore } from "../stores/auth-store";
import { useBranchContextStore } from "../stores/branch-context-store";

/**
 * The three facts every Business-view rule asks about: what the account may
 * see, how many branches the store has, and whether this is the demo tour.
 *
 * The branch count is read from the branch-context store rather than by
 * querying, because `useOutlets` — mounted once by `useBranchLanding` in the
 * tab layout — already publishes the active branches there. A second query per
 * consumer would fetch the same rows for the tab bar and the switcher sheet.
 *
 * `null` means the list has not loaded yet, which the rules treat as
 * single-location: the Business view never flashes into the switcher and out
 * again on a cold start.
 *
 * The account scope, not the effective one: whether the view *exists* cannot
 * depend on which branch has been drilled into, or an owner would lose the
 * portfolio the moment they used it.
 */
export function usePortfolioAudience(): PortfolioAudience {
  const accountScope = useAccountBranchScope();
  const isDemo = useAuthStore((s) => s.isDemo);
  const knownOutletIds = useBranchContextStore((s) => s.knownOutletIds);

  return useMemo(
    () => ({
      accountScope,
      activeOutletCount: knownOutletIds?.length ?? null,
      isDemo,
    }),
    [accountScope, knownOutletIds, isDemo],
  );
}
