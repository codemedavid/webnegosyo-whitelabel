import { canChooseBranch, resolveEffectiveScope } from "./branch-context";
import type { BranchScope } from "./branch-scope";

/**
 * The owner drill-down seam.
 *
 * `resolveBranchScope` answers what an *account* may see. This module answers
 * what it is *currently looking at* — the owner picking one branch out of the
 * portfolio. The two are composed here, and the composition is the security
 * boundary: a viewing choice may narrow what an account sees and must never
 * widen it.
 */

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "outlet-north" };
const KNOWN = ["outlet-north", "outlet-south"] as const;

describe("resolveEffectiveScope", () => {
  it("keeps a branch account on its own branch when it has no selection", () => {
    expect(resolveEffectiveScope(NORTH, null, KNOWN)).toEqual(NORTH);
  });

  it("never widens a branch account, even to a branch that exists", () => {
    // The manager of North asking for South stays on North. This is the rule
    // the whole feature rests on: the account scope is the boundary, the
    // selection is only ever a narrowing on top of it.
    expect(resolveEffectiveScope(NORTH, "outlet-south", KNOWN)).toEqual(NORTH);
  });

  it("narrows an owner to the branch they selected", () => {
    expect(resolveEffectiveScope(ALL, "outlet-south", KNOWN)).toEqual({
      kind: "branch",
      outletId: "outlet-south",
    });
  });

  it("leaves an owner store-wide when nothing is selected", () => {
    expect(resolveEffectiveScope(ALL, null, KNOWN)).toEqual(ALL);
  });

  it("treats a blank selection as store-wide", () => {
    expect(resolveEffectiveScope(ALL, "   ", KNOWN)).toEqual(ALL);
    expect(resolveEffectiveScope(ALL, undefined, KNOWN)).toEqual(ALL);
  });

  it("falls back to store-wide for a branch this store does not have", () => {
    // A deleted or foreign branch resolves to the whole store rather than to a
    // scope that matches no order: an empty Operations tab reads as a broken
    // app, while store-wide reads as "no branch chosen" — which is the truth.
    expect(resolveEffectiveScope(ALL, "outlet-gone", KNOWN)).toEqual(ALL);
  });

  it("falls back to store-wide when the store has no branches at all", () => {
    expect(resolveEffectiveScope(ALL, "outlet-north", [])).toEqual(ALL);
  });

  it("trusts a selection while the branch list is still loading", () => {
    // Omitting the list means "not known yet", not "no branches". The
    // selection could only have been set by tapping a card in that same list,
    // so honouring it avoids the context flickering back to store-wide on
    // every cold start before the query resolves.
    expect(resolveEffectiveScope(ALL, "outlet-north")).toEqual(NORTH);
  });

  it("ignores surrounding whitespace on a selection", () => {
    expect(resolveEffectiveScope(ALL, " outlet-north ", KNOWN)).toEqual(NORTH);
  });
});

describe("canChooseBranch", () => {
  it("lets a store-wide account pick a branch", () => {
    expect(canChooseBranch(ALL)).toBe(true);
  });

  it("does not offer the choice to a branch account", () => {
    // The context bar shows a manager their branch as a label. Offering a
    // switch that cannot change anything would read as a broken control.
    expect(canChooseBranch(NORTH)).toBe(false);
  });
});
