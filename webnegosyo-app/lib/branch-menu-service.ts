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
import { NOTHING_CHANGED_MESSAGE, assertRowsChangedOrGone } from "./assert-rows-changed";
import { readAllPages, type PageResponse } from "./gov-reports/paging";
import { planBranchListingWrite } from "./branch-menu";
import type { OutletMenuOverrideRow } from "./outlet-menu-overrides";

/**
 * Spelled out rather than `*` for the reason the web's projection test exists:
 * a column the app reads but the query never selects arrives as `undefined`
 * and silently resolves to a default — here, "this branch carries it".
 */
const OVERRIDE_SELECT =
  "outlet_id, menu_item_id, is_listed, is_available, price, discounted_price, discount_cleared";

/**
 * One response from the platform database carries at most 1,000 rows and says
 * nothing about the rest. A store's rows are dishes x branches-that-differ, so
 * the read is paged up to a ceiling far above any real store; past it the
 * read fails rather than answer with part of the rows.
 */
const OVERRIDE_PAGE_SIZE = 1000;
const MAX_OVERRIDE_ROWS = 20_000;

/** Every branch difference the store has, for the cross-branch product list. */
export async function listBranchMenuOverrides(
  tenantId: string,
): Promise<OutletMenuOverrideRow[]> {
  // Not swallowed: an empty result is the claim "no branch differs from the
  // store-wide menu", which after a failed query hides every delisted dish.
  // A failed page throws for the same reason, and so does a short list: a
  // difference that was not read shows its dish as carried at the store price.
  const { rows, isTruncated } = await readAllPages<OutletMenuOverrideRow>(
    (from, to) =>
      supabase
        .from("outlet_menu_items")
        .select(OVERRIDE_SELECT)
        .eq("tenant_id", tenantId)
        // One row per dish per branch, so this order is unique and pages
        // never overlap or skip.
        .order("outlet_id", { ascending: true })
        .order("menu_item_id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<PageResponse<OutletMenuOverrideRow>>,
    { pageSize: OVERRIDE_PAGE_SIZE, maxRows: MAX_OVERRIDE_ROWS },
  );
  if (isTruncated) {
    throw new Error("This store has more than 20,000 branch menu differences, too many to load at once.");
  }
  return rows;
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
    // Zero rows removed with the row still there = row-level security refused
    // it (the branch still does not carry the dish); zero rows with it gone
    // means someone else put the dish back first.
    const result = await assertRowsChangedOrGone(
      await supabase
        .from("outlet_menu_items")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("outlet_id", outletId)
        .eq("menu_item_id", menuItemId)
        .select("menu_item_id"),
      () =>
        supabase
          .from("outlet_menu_items")
          .select("menu_item_id")
          .eq("tenant_id", tenantId)
          .eq("outlet_id", outletId)
          .eq("menu_item_id", menuItemId)
          .limit(1),
    );
    if (!result.ok) {
      throw new Error(result.reason === "error" ? result.error.message : NOTHING_CHANGED_MESSAGE);
    }
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
