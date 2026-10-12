/**
 * What the register knows about the store's Senior/PWD rules right now.
 *
 * Filled by the register screen (`useGovDiscountRegister`) from the tax
 * profile and the catalog it already sells from, and read by the cart store
 * when it prices a sale — the same arrangement the cart uses for the signed-in
 * user. Not persisted: both sources are offline-snapshotted already.
 */

import { create } from "zustand";
import type { TaxProfile } from "../lib/gov-discount";

interface GovDiscountContextState {
  tenantId: string | null;
  /** Null until loaded, or when the store has not set up Tax & discounts. */
  profile: TaxProfile | null;
  /** True once the profile read has answered (with a row or with none). */
  isProfileKnown: boolean;
  excludedMenuItemIds: ReadonlySet<string>;
  setProfile: (tenantId: string, profile: TaxProfile | null) => void;
  setExcludedMenuItemIds: (ids: ReadonlySet<string>) => void;
}

const NONE: ReadonlySet<string> = new Set();

export const useGovDiscountContextStore = create<GovDiscountContextState>((set) => ({
  tenantId: null,
  profile: null,
  isProfileKnown: false,
  excludedMenuItemIds: NONE,
  setProfile: (tenantId, profile) => set({ tenantId, profile, isProfileKnown: true }),
  setExcludedMenuItemIds: (excludedMenuItemIds) => set({ excludedMenuItemIds }),
}));
