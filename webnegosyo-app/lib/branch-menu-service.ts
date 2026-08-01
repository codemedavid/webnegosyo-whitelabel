/**
 * Reading and writing per-branch menu overrides from the merchant app.
 *
 * Branches and their overrides live in the platform Supabase for every tenant
 * regardless of which database serves that store's orders — the same reason
 * `use-outlets.ts` queries Supabase directly instead of going through the
 * order-backend dispatch. So this works for Convex-backed stores too.
 *
 * The write is a read-then-merge, never a bare upsert of the one column that
 * changed: `is_listed` shares a row with the branch's price, its sale, its
 * opt-out and its sold-out mark, and PostgREST would reset every column the
 * caller did not mention. The merge itself lives in `branch-menu.ts` so the
 * decision is testable without a database.
 */

import { supabase } from "./supabase";
import { planBranchListingWrite } from "./branch-menu";
import type { OutletMenuOverrideRow } from "./outlet-menu-overrides";

/**
 * Spelled out rather than `*` for the reason the web's projection test exists:
 * a column the app reads but the query never selects arrives as `undefined`
 * and silently resolves to a default — here, "this branch carries it".
 */
const OVERRIDE_SELECT =
  "outlet_id, menu_item_id, is_listed, is_available, price, discounted_price, discount_cleared";

/** Every branch difference the store has, for the cross-branch product list. */
export async function listBranchMenuOverrides(
  tenantId: string,
): Promise<OutletMenuOverrideRow[]> {
  const { data, error } = await supabase
    .from("outlet_menu_items")
    .select(OVERRIDE_SELECT)
    .eq("tenant_id", tenantId);

  // Not swallowed: an empty result is the claim "no branch differs from the
  // store-wide menu", which after a failed query hides every delisted dish.
  if (error) throw new Error(error.message);

  return (data ?? []) as unknown as OutletMenuOverrideRow[];
}

async function findBranchOverride(
  tenantId: string,
  outletId: string,
  menuItemId: string,
): Promise<OutletMenuOverrideRow | null> {
  const { data, error } = await supabase
    .from("outlet_menu_items")
    .select(OVERRIDE_SELECT)
    .eq("tenant_id", tenantId)
    .eq("outlet_id", outletId)
    .eq("menu_item_id", menuItemId)
    .maybeSingle();

  // Reading a failure as "no row" would write a fresh row of store-wide
  // defaults over whatever price this branch had set.
  if (error) throw new Error(error.message);

  return (data ?? null) as unknown as OutletMenuOverrideRow | null;
}

/** Turn one branch's listing switch for one dish. */
export async function setBranchListing(
  tenantId: string,
  outletId: string,
  menuItemId: string,
  isListed: boolean,
): Promise<void> {
  const current = await findBranchOverride(tenantId, outletId, menuItemId);
  const plan = planBranchListingWrite(current, isListed);

  if (plan.kind === "noop") return;

  if (plan.kind === "delete") {
    const { error } = await supabase
      .from("outlet_menu_items")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("outlet_id", outletId)
      .eq("menu_item_id", menuItemId);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("outlet_menu_items").upsert(
    {
      tenant_id: tenantId,
      outlet_id: outletId,
      menu_item_id: menuItemId,
      ...plan.values,
    } as never,
    { onConflict: "outlet_id,menu_item_id" },
  );

  if (error) throw new Error(error.message);
}
