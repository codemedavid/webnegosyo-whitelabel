import { resolveBranchScope, type BranchScopedSession } from './branch-scope';
import { resolveEffectiveScope } from './branch-context';
import { posOutletContext } from './order-outlet';

export function resolveRegisterOutlet(
  session: BranchScopedSession & { outletName?: string | null },
  selection: { selectedOutletId: string | null; selectedOutletName: string | null; knownOutletIds: readonly string[] | null },
) {
  const account = resolveBranchScope(session);
  const scope = resolveEffectiveScope(account, selection.selectedOutletId, selection.knownOutletIds ?? undefined);
  if (account.kind === 'all' && scope.kind === 'branch' && selection.knownOutletIds && !selection.knownOutletIds.includes(scope.outletId)) return null;
  return scope.kind === 'branch'
    ? posOutletContext(scope.outletId, account.kind === 'branch' ? session.outletName : selection.selectedOutletName)
    : null;
}

/**
 * A store with branches rings every sale up for ONE of them, so a store-wide
 * account looking at the whole store must open a branch first. The register
 * refuses the first dish otherwise (`pos-cart-store` `add`, the same test); a
 * screen that sends someone to the register asks this before it does.
 */
export function registerNeedsBranch(
  session: BranchScopedSession & { outletName?: string | null },
  selection: { selectedOutletId: string | null; selectedOutletName: string | null; knownOutletIds: readonly string[] | null },
): boolean {
  return (selection.knownOutletIds?.length ?? 0) > 0 && resolveRegisterOutlet(session, selection) === null;
}
