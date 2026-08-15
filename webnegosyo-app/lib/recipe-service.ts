/**
 * Wiring a dish to its ingredients from the merchant's phone.
 *
 * Deduction is recipe-driven: a sale only moves stock if the dish has a
 * `recipes` row whose `recipe_components` name the ingredients. The web admin
 * can build those; until this file the app could not, so an app-first merchant
 * had a shelf that never moved. This is the missing write path.
 *
 * WHY THIS WRITES DIRECTLY, when lib/inventory-movement-service.ts deliberately
 * does not. A movement needs the platform: the signed delta is resolved against
 * the on-hand quantity read in the same request, prices blend into the moving
 * average, and crossing the reorder line raises alerts. A recipe is plain
 * CRUD — it records what a dish is made of, not a change to any shelf — and
 * `recipes` / `recipe_components` RLS (migration 20260722120000, "Admins
 * manage own-tenant rows") already confines the writer to their tenant. A
 * route would add a hop and no boundary. The queries still filter by tenant
 * explicitly: a query that relies on RLS to be correct reads as though it did
 * not need to be.
 *
 * MVP scope: base menu-item recipes only. Variation-option and addon recipes
 * (`target_type` 'variation_option' / 'addon') are a later iteration.
 */

import { supabase } from "./supabase";

/** Injected in tests so no connection is opened. */
type Db = Pick<typeof supabase, "from">;

const BASE_TARGET_TYPE = "menu_item";

export interface RecipeComponentView {
  id: string;
  inventoryItemId: string;
  /** Blank when the ingredient catalog could not be read — label, not line. */
  ingredientName: string;
  quantity: number;
  unitId: string;
  /** Unit abbreviation; blank when the unit catalog could not be read. */
  unitLabel: string;
}

export interface MenuItemRecipe {
  id: string;
  components: RecipeComponentView[];
}

/** An ingredient the merchant can add, with its stock unit as the default. */
export interface IngredientOption {
  id: string;
  name: string;
  stockUnitId: string | null;
  unitLabel: string;
}

export interface AddComponentInput {
  recipeId: string;
  inventoryItemId: string;
  quantity: number;
  unitId: string;
  sortOrder: number;
}

export interface ComponentChanges {
  quantity: number;
  unitId: string;
}

/**
 * Turn a Supabase error into one the merchant can be shown.
 *
 * Supabase rejects with a plain object, not an `Error`; rethrown as-is it
 * arrives at the screen with no `message` to render. The reason is kept —
 * "row-level security" tells them they are signed into the wrong store, where
 * a generic failure tells them nothing.
 */
function asError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message ? `${fallback} (${error.message})` : fallback);
}

/**
 * Refuse a quantity that cannot deduct.
 *
 * Zero is refused as well as the negatives: a zero-quantity line looks wired
 * up on the screen while deducting nothing, which is the exact silent failure
 * this editor exists to end.
 */
function assertUsableQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Enter a quantity greater than zero.");
  }
}

interface ComponentRow {
  id: string;
  inventory_item_id: string;
  quantity: number | string;
  unit_id: string;
  sort_order: number;
}

/** The dish's base recipe row, or null when it has none. */
async function findBaseRecipe(
  db: Db,
  tenantId: string,
  menuItemId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("recipes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("menu_item_id", menuItemId)
    .eq("target_type", BASE_TARGET_TYPE)
    .maybeSingle();

  if (error) throw asError(error, "The recipe could not be read.");
  return (data as { id: string } | null) ?? null;
}

/**
 * The dish's recipe with its lines joined to ingredient names and unit
 * abbreviations, or `null` when the dish has no recipe yet.
 *
 * A failed name or unit read costs the labels, not the list — the same
 * posture as loadInventoryStock. A failed read of the LINES throws: rendering
 * an empty editor over lines that exist would invite the merchant to re-add
 * every ingredient twice.
 */
export async function loadMenuItemRecipe(
  tenantId: string,
  menuItemId: string,
  db: Db = supabase,
): Promise<MenuItemRecipe | null> {
  if (!tenantId || !menuItemId) return null;

  const recipe = await findBaseRecipe(db, tenantId, menuItemId);
  if (!recipe) return null;

  const [componentsResult, itemsResult, unitsResult] = await Promise.all([
    db
      .from("recipe_components")
      .select("id, inventory_item_id, quantity, unit_id, sort_order")
      .eq("tenant_id", tenantId)
      .eq("recipe_id", recipe.id)
      .order("sort_order", { ascending: true }),
    db.from("inventory_items").select("id, name").eq("tenant_id", tenantId),
    db.from("inventory_units").select("id, abbreviation").eq("tenant_id", tenantId),
  ]);

  if (componentsResult.error) {
    throw asError(componentsResult.error, "The recipe's ingredients could not be read.");
  }

  const names = new Map(
    ((itemsResult.error ? [] : itemsResult.data ?? []) as unknown as {
      id: string;
      name: string;
    }[]).map((row) => [row.id, row.name]),
  );
  const units = new Map(
    ((unitsResult.error ? [] : unitsResult.data ?? []) as unknown as {
      id: string;
      abbreviation: string;
    }[]).map((row) => [row.id, row.abbreviation]),
  );

  const components = ((componentsResult.data ?? []) as unknown as ComponentRow[]).map(
    (row): RecipeComponentView => ({
      id: row.id,
      inventoryItemId: row.inventory_item_id,
      ingredientName: names.get(row.inventory_item_id) ?? "",
      quantity: Number(row.quantity),
      unitId: row.unit_id,
      unitLabel: units.get(row.unit_id) ?? "",
    }),
  );

  return { id: recipe.id, components };
}

/**
 * The tenant's active ingredients, each carrying its stock unit as the
 * sensible default for a new line.
 */
export async function loadIngredientOptions(
  tenantId: string,
  db: Db = supabase,
): Promise<IngredientOption[]> {
  // The auth store starts empty — a cold mount must not query for every tenant.
  if (!tenantId) return [];

  const [itemsResult, unitsResult] = await Promise.all([
    db
      .from("inventory_items")
      .select("id, name, is_active, stock_unit_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    db.from("inventory_units").select("id, abbreviation").eq("tenant_id", tenantId),
  ]);

  if (itemsResult.error) {
    throw asError(itemsResult.error, "The ingredient list could not be read.");
  }

  // A unit catalog that cannot be read costs the suffix, not the shelf.
  const units = new Map(
    ((unitsResult.error ? [] : unitsResult.data ?? []) as unknown as {
      id: string;
      abbreviation: string;
    }[]).map((row) => [row.id, row.abbreviation]),
  );

  return ((itemsResult.data ?? []) as unknown as {
    id: string;
    name: string;
    stock_unit_id: string | null;
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    stockUnitId: row.stock_unit_id,
    unitLabel: row.stock_unit_id ? units.get(row.stock_unit_id) ?? "" : "",
  }));
}

export interface UnitOption {
  id: string;
  abbreviation: string;
}

/** The tenant's unit catalog, for the unit picker on a recipe line. */
export async function loadUnitOptions(
  tenantId: string,
  db: Db = supabase,
): Promise<UnitOption[]> {
  // The auth store starts empty — a cold mount must not query for every tenant.
  if (!tenantId) return [];

  const { data, error } = await db
    .from("inventory_units")
    .select("id, abbreviation")
    .eq("tenant_id", tenantId)
    .order("abbreviation", { ascending: true });

  if (error) throw asError(error, "The unit list could not be read.");
  return (data ?? []) as unknown as UnitOption[];
}

/**
 * The dish's base recipe id, creating the row if it has none.
 *
 * Finding-then-inserting rather than upserting keeps the common path a plain
 * read; the unique partial index (idx_recipes_menu_item_base_uq) refuses a
 * duplicate if two phones race, and that refusal surfaces like any other
 * failed insert.
 */
export async function ensureMenuItemRecipe(
  tenantId: string,
  menuItemId: string,
  db: Db = supabase,
): Promise<string> {
  const existing = await findBaseRecipe(db, tenantId, menuItemId);
  if (existing) return existing.id;

  const { data, error } = await db
    .from("recipes")
    .insert({
      tenant_id: tenantId,
      target_type: BASE_TARGET_TYPE,
      menu_item_id: menuItemId,
    } as never)
    .select("id")
    .single();

  if (error) throw asError(error, "The recipe could not be created.");
  if (!data) throw new Error("The recipe could not be created. Try again.");
  return (data as { id: string }).id;
}

/** Add one ingredient line. Throws with a message worth showing. */
export async function addRecipeComponent(
  tenantId: string,
  input: AddComponentInput,
  db: Db = supabase,
): Promise<void> {
  assertUsableQuantity(input.quantity);

  const { error } = await db.from("recipe_components").insert({
    tenant_id: tenantId,
    recipe_id: input.recipeId,
    inventory_item_id: input.inventoryItemId,
    quantity: input.quantity,
    unit_id: input.unitId,
    sort_order: input.sortOrder,
  } as never);

  if (error) throw asError(error, "The ingredient could not be added.");
}

/** Change a line's quantity or unit. */
export async function updateRecipeComponent(
  tenantId: string,
  componentId: string,
  changes: ComponentChanges,
  db: Db = supabase,
): Promise<void> {
  assertUsableQuantity(changes.quantity);

  const { error } = await db
    .from("recipe_components")
    .update({ quantity: changes.quantity, unit_id: changes.unitId } as never)
    .eq("tenant_id", tenantId)
    .eq("id", componentId);

  if (error) throw asError(error, "The ingredient could not be updated.");
}

/** Remove a line. The recipe row stays; an empty recipe deducts nothing. */
export async function removeRecipeComponent(
  tenantId: string,
  componentId: string,
  db: Db = supabase,
): Promise<void> {
  const { error } = await db
    .from("recipe_components")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", componentId);

  if (error) throw asError(error, "The ingredient could not be removed.");
}
