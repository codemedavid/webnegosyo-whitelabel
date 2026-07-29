/**
 * What this session is currently *looking at*, as opposed to what it is
 * *allowed* to see.
 *
 * `branch-scope.ts` answers the second question from the account's own fields.
 * An owner is unconfined there — and that is right, because the cross-branch
 * views exist for them — but an owner running three branches spends most of
 * the day working one of them. This module lets them drill into a branch from
 * the portfolio and have the whole app follow: Operations, Register, Insights
 * and Products all narrow, because every one of those screens reads its scope
 * from `useBranchScope`, and that hook composes the two answers here.
 *
 * The composition is the security boundary, so it is stated once, in one
 * direction: a selection may only ever *narrow*. A branch account's scope is
 * returned untouched no matter what selection accompanies it, which means a
 * manager cannot reach another branch by any route through this module — not
 * a stale store value, not a deep link, not a tampered persisted state.
 *
 * Pure and dependency-free, like the module it builds on: the store holding
 * the selection is a thin zustand shell over these decisions.
 */

import type { BranchScope } from "./branch-scope";

function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The scope to actually filter by, given who the account is and which branch
 * they have drilled into.
 *
 * `knownOutletIds` is the store's own branches, used to reject a selection
 * this store does not have — a branch deleted while it was being viewed, or an
 * id left over from another store on a shared device. Such a selection
 * resolves to the whole store rather than to a branch matching no order: an
 * empty Operations tab reads as a broken app, while store-wide reads as "no
 * branch chosen", which is what actually happened.
 *
 * Omitting `knownOutletIds` means the list has not loaded yet, which is not
 * the same as the store having no branches. The selection is honoured in that
 * window — it could only have been set by tapping a card in that same list —
 * so the context does not flicker back to store-wide on every cold start.
 */
export function resolveEffectiveScope(
  accountScope: BranchScope,
  selectedOutletId: string | null | undefined,
  knownOutletIds?: readonly string[],
): BranchScope {
  // A confined account is already as narrow as it goes. Returned before the
  // selection is even read, so there is no path where one widens the other.
  if (accountScope.kind === "branch") return accountScope;

  const selected = trimmed(selectedOutletId);
  if (selected === "") return accountScope;

  if (knownOutletIds && !knownOutletIds.includes(selected)) return accountScope;

  return { kind: "branch", outletId: selected };
}

/**
 * Whether this account may choose which branch to view.
 *
 * Only a store-wide account can: for a branch account the context bar shows
 * its branch as a label, because a switch that cannot change anything would
 * read as a broken control rather than as a restriction.
 */
export function canChooseBranch(accountScope: BranchScope): boolean {
  return accountScope.kind === "all";
}
