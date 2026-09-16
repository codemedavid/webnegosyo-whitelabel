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
 * A stale selection must stay narrow until explicitly cleared. Falling back
 * to the whole store would put every branch's totals under the old branch
 * heading. The register separately validates the roster before accepting sales.

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

  if (knownOutletIds && !knownOutletIds.includes(selected)) {
    return { kind: "branch", outletId: selected };
  }

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
