import { useMemo } from "react";

import { resolveBranchScope, type BranchScope } from "./branch-scope";
import { resolveEffectiveScope } from "./branch-context";
import { useAuthStore } from "../stores/auth-store";
import { useBranchContextStore } from "../stores/branch-context-store";

/**
 * The branch this session is currently working in.
 *
 * Two things decide it, and they are composed rather than chosen between:
 *
 * - what the *account* may see (`resolveBranchScope`) — the rules for who is
 *   confined live in one place, and a screen that forgot one of them would
 *   leak another branch's orders;
 * - which branch the merchant has *drilled into* from the portfolio
 *   (`resolveEffectiveScope`) — a narrowing an owner can apply and undo.
 *
 * Every order surface reads its scope through this hook, so the drill-down
 * reaches Operations, Register, Insights and Products without any of them
 * knowing the feature exists. The composition can only narrow: a branch
 * account is returned unchanged whatever the selection says.
 *
 * The result is memoised so passing it into `useMemo` dependencies downstream
 * does not re-run the filters on every render.
 */
export function useBranchScope(): BranchScope {
  const outletId = useAuthStore((s) => s.outletId);
  const isOwner = useAuthStore((s) => s.isOwner);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const isDemo = useAuthStore((s) => s.isDemo);

  const selectedOutletId = useBranchContextStore((s) => s.selectedOutletId);
  const knownOutletIds = useBranchContextStore((s) => s.knownOutletIds);

  return useMemo(() => {
    const accountScope = resolveBranchScope({ outletId, isOwner, isSuperadmin, isDemo });
    return resolveEffectiveScope(accountScope, selectedOutletId, knownOutletIds ?? undefined);
  }, [outletId, isOwner, isSuperadmin, isDemo, selectedOutletId, knownOutletIds]);
}

/**
 * The scope an account is confined to, ignoring any branch it has drilled into.
 *
 * The portfolio needs this: it compares every branch the *account* may see, so
 * it must not be narrowed by the branch currently being viewed — otherwise
 * drilling into one branch would leave the owner unable to see the list they
 * came from.
 */
export function useAccountBranchScope(): BranchScope {
  const outletId = useAuthStore((s) => s.outletId);
  const isOwner = useAuthStore((s) => s.isOwner);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const isDemo = useAuthStore((s) => s.isDemo);

  return useMemo(
    () => resolveBranchScope({ outletId, isOwner, isSuperadmin, isDemo }),
    [outletId, isOwner, isSuperadmin, isDemo],
  );
}
