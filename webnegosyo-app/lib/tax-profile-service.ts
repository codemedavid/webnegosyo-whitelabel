/**
 * The store's Tax & discounts settings (`store_tax_profiles`), as the merchant
 * app reads and writes them.
 *
 * Every account of the store may read (the register needs the VAT status);
 * only the OWNER may write — RLS enforces it, and an RLS refusal is silent, so
 * a save checks that a row actually came back.
 */

import { supabase } from "./supabase";
import {
  TAX_PROFILE_COLUMNS,
  taxProfileFromRow,
  taxProfileToRow,
  type TaxProfile,
} from "./gov-discount";

/** Null when the store has not set up Tax & discounts yet. */
export async function fetchTaxProfile(tenantId: string): Promise<TaxProfile | null> {
  const { data, error } = await supabase
    .from("store_tax_profiles")
    .select(TAX_PROFILE_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return taxProfileFromRow(data);
}

export async function saveTaxProfile(tenantId: string, profile: TaxProfile): Promise<TaxProfile> {
  const { data, error } = await supabase
    .from("store_tax_profiles")
    .upsert({ tenant_id: tenantId, ...taxProfileToRow(profile) }, { onConflict: "tenant_id" })
    .select(TAX_PROFILE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  const saved = taxProfileFromRow(data);
  if (!saved) {
    throw new Error("Only the store owner can change Tax & discounts.");
  }
  return saved;
}

/** The two switches a catalog row may carry (absent = covered). */
interface EligibilityFlags {
  gov_discount_eligible?: boolean | null;
  category?: { gov_discount_eligible?: boolean | null } | null;
}

/**
 * Menu items the owner excluded from Senior/PWD discounts — the item's own
 * switch, or its category's. Read from the register's catalog, so it works
 * offline from the same snapshot the register sells from. The catalog read is
 * `select("*, category:categories(*)")`, so both switches arrive with it.
 */
export function excludedMenuItemIds(items: readonly { product: { id: string } }[]): Set<string> {
  return new Set(
    items
      .filter(({ product }) => {
        const flags = product as EligibilityFlags;
        return flags.gov_discount_eligible === false || flags.category?.gov_discount_eligible === false;
      })
      .map(({ product }) => product.id),
  );
}
