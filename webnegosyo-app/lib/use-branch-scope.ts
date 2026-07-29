import { useMemo } from "react";

import { resolveBranchScope, type BranchScope } from "./branch-scope";
import { useAuthStore } from "../stores/auth-store";

/**
 * The branch this session may see.
 *
 * Every order surface reads the scope through this hook rather than pulling the
 * four auth fields apart itself — the rules for who is confined (not owners,
 * not superadmins, not the demo tour) live in one place, and a screen that
 * forgets one of them would leak another branch's orders.
 *
 * The result is memoised so passing it to `useMemo` dependencies downstream
 * does not re-run the filter on every render.
 */
export function useBranchScope(): BranchScope {
  const outletId = useAuthStore((s) => s.outletId);
  const isOwner = useAuthStore((s) => s.isOwner);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const isDemo = useAuthStore((s) => s.isDemo);

  return useMemo(
    () => resolveBranchScope({ outletId, isOwner, isSuperadmin, isDemo }),
    [outletId, isOwner, isSuperadmin, isDemo],
  );
}
