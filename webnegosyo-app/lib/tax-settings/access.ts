/**
 * Who may open Settings → Tax & discounts and the Senior & PWD sales book.
 *
 * Every store account may READ the tax profile (the register needs the VAT
 * status), but the screen is a setup screen: it is listed for whoever sets up
 * the store or reviews its discounts. Only the OWNER may change it — the
 * database refuses everyone else (`app_user_is_store_owner`), so the screen
 * shows them the same settings read-only, with a note saying why.
 */

import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";

export interface TaxAccessHolder extends StaffPermissionHolder {
  isDemo: boolean;
}

export function canOpenTaxSettings(holder: TaxAccessHolder): boolean {
  if (holder.isDemo) return false;
  return hasPermission(holder, "store_setup") || hasPermission(holder, "discount_review");
}

/** Mirrors the `store_tax_profiles` write policy: the owner. */
export function canEditTaxSettings(holder: TaxAccessHolder): boolean {
  return !holder.isDemo && holder.isOwner;
}

/** The sales book is readable only by owners, full-access staff and `discount_review` holders (RLS). */
export function canReviewGovDiscounts(holder: TaxAccessHolder): boolean {
  return !holder.isDemo && hasPermission(holder, "discount_review");
}
