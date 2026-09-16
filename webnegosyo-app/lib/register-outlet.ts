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
