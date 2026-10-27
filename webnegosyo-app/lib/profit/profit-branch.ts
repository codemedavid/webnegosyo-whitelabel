/**
 * Which branch the Profit screen reads. A branch-locked account always reads
 * its own branch, whatever was chosen — the database refuses anything else
 * (reporting.assert_access) and the screen must never offer it. Pure.
 */

import type { BranchScope } from "../branch-scope";
import type { ProfitBranch } from "./profit-service";

/** "all", "unassigned" (rows tied to no branch: store-wide costs), or an outlet id. */
export type BranchChoice = string;

export const ALL_BRANCHES = "all";
export const UNASSIGNED = "unassigned";

export interface ProfitBranchView {
  branch: ProfitBranch;
  /** Offer the branch chips (store-wide account, several branches). */
  canPick: boolean;
  /** For the caption; null = say nothing (single-branch store). */
  label: string | null;
}

export function resolveProfitBranch(input: {
  account: BranchScope;
  accountOutletName: string | null;
  outlets: readonly { id: string; name: string }[];
  choice: BranchChoice;
}): ProfitBranchView {
  if (input.account.kind === "branch") {
    return {
      branch: { outletId: input.account.outletId, unassigned: false },
      canPick: false,
      label: input.accountOutletName ?? "Your branch",
    };
  }
  const canPick = input.outlets.length > 1;
  if (!canPick) return { branch: { outletId: null, unassigned: false }, canPick: false, label: null };
  if (input.choice === UNASSIGNED) {
    return { branch: { outletId: null, unassigned: true }, canPick, label: "Store-wide only" };
  }
  const outlet = input.outlets.find((candidate) => candidate.id === input.choice);
  if (outlet) return { branch: { outletId: outlet.id, unassigned: false }, canPick, label: outlet.name };
  return { branch: { outletId: null, unassigned: false }, canPick, label: "All branches" };
}
