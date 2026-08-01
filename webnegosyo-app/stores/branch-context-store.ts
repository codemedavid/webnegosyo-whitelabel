import { create } from "zustand";

/**
 * Which branch the merchant is currently looking at.
 *
 * This is a *viewing* choice, not a permission: an owner drills into a branch
 * from the portfolio and every order surface follows. What that choice is
 * allowed to do lives in `lib/branch-context.ts` — this store only holds it,
 * the same way `workspace-store` only holds the active view.
 *
 * Deliberately not persisted. A branch context that outlived the session would
 * quietly narrow the next sign-in — including a different account on a shared
 * device — and the merchant would have no idea why half their orders were
 * missing.
 */
interface BranchContextState {
  /** Branch being viewed; null = the whole store. */
  selectedOutletId: string | null;
  /** Its name, for the context bar. Snapshotted so the bar needs no query. */
  selectedOutletName: string | null;
  /**
   * The store's own branch ids, used to reject a selection this store does not
   * have. `null` means "not loaded yet", which is not the same as "no
   * branches" — see `resolveEffectiveScope`.
   */
  knownOutletIds: string[] | null;
  selectBranch: (outletId: string, outletName: string) => void;
  clearBranch: () => void;
  setKnownOutlets: (outlets: readonly { id: string }[]) => void;
  clear: () => void;
}

const EMPTY = {
  selectedOutletId: null,
  selectedOutletName: null,
  knownOutletIds: null,
} as const;

export const useBranchContextStore = create<BranchContextState>((set) => ({
  ...EMPTY,
  selectBranch: (outletId, outletName) =>
    set({ selectedOutletId: outletId, selectedOutletName: outletName }),
  clearBranch: () => set({ selectedOutletId: null, selectedOutletName: null }),
  setKnownOutlets: (outlets) => set({ knownOutletIds: outlets.map((outlet) => outlet.id) }),
  clear: () => set({ ...EMPTY }),
}));
