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
 * Scope: the dish's own (base) recipe AND a recipe per choice on it — a
 * modifier option, a legacy variation option or a legacy add-on (see
 * `recipe-target.ts` for how each maps to `recipes` columns). A choice's
 * ingredients are spent each time it is picked, on top of the dish's own.
 * Without them a "pick your flavours ×N" dish deducted nothing beyond its base.
 *
 * Every write asserts the rows it touched: RLS refusals are silent (zero rows,
 * no error), and a line that "saved" without saving is worse than an error.
 */

import { supabase } from "./supabase";
import {
  OPTION_ID_COLUMN,
  buildRecipeTargetColumns,
  dishRecipeChoices,
  targetKey,
  targetOptionId,
  type OptionRecipeGroup,
  type RecipeTarget,
} from "./recipe-target";
import { recipeLineProblem, toUnitDimension, type RuleIngredient, type RuleUnit, type UnitDimension } from "./recipe-line-rules";
import type { ModifierSource } from "./modifier-groups";

/** Injected in tests so no connection is opened. */
type Db = Pick<typeof supabase, "from">;

/**
 * What a line is judged against before it is written: the ingredient's stock
 * unit and the unit catalogue (`recipe-line-rules.ts`). Optional so a caller
 * without the catalogue still gets the quantity check.
 */
export interface LineCheck {
  ingredient: RuleIngredient;
  units: readonly RuleUnit[];
}

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
  check?: LineCheck;
}

export interface ComponentChanges {
  quantity: number;
  unitId: string;
  check?: LineCheck;
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

/** The full line rule, when the caller handed over what it needs. */
function assertUsableLine(line: { quantity: number; unitId: string }, check?: LineCheck): void {
  assertUsableQuantity(line.quantity);
  if (!check) return;
  const problem = recipeLineProblem(line, check.ingredient, check.units);
  if (problem) throw new Error(problem);
}

/**
 * An UPDATE or DELETE that RLS refuses (or that names a line another phone
 * already removed) touches zero rows and reports no error. Without this the
 * screen reloads the old value and the merchant is never told it did not save.
 */
function assertRowChanged(data: unknown, fallback: string): void {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${fallback} Pull down to refresh — it may have changed on another device.`);
  }
}

interface ComponentRow {
  id: string;
  inventory_item_id: string;
  quantity: number | string;
  unit_id: string;
  sort_order: number;
}

/** The target's recipe row, or null when it has none. */
async function findRecipe(
  db: Db,
  tenantId: string,
  target: RecipeTarget,
): Promise<{ id: string } | null> {
  const columns = buildRecipeTargetColumns(target);
  let query = db
    .from("recipes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("menu_item_id", columns.menu_item_id)
    .eq("target_type", columns.target_type);
  const optionId = targetOptionId(target);
  if (target.type !== "menu_item" && optionId !== null) {
    query = query.eq(OPTION_ID_COLUMN[target.type], optionId);
  }
  const { data, error } = await query.maybeSingle();

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
  return loadRecipe(tenantId, { type: "menu_item", menuItemId }, db);
}

/** Any target's recipe — the dish's own, or one of its choices'. */
export async function loadRecipe(
  tenantId: string,
  target: RecipeTarget,
  db: Db = supabase,
): Promise<MenuItemRecipe | null> {
  if (!tenantId || !target.menuItemId) return null;

  const recipe = await findRecipe(db, tenantId, target);
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
 * The dish's name, for the editor's header.
 *
 * Blank on any failure: the name is a label, and a header without one is
 * better than a recipe editor that refuses to open over it.
 */
export async function loadDishName(
  tenantId: string,
  menuItemId: string,
  db: Db = supabase,
): Promise<string> {
  if (!tenantId || !menuItemId) return "";

  const { data, error } = await db
    .from("menu_items")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("id", menuItemId)
    .maybeSingle();

  if (error || !data) return "";
  return (data as { name: string | null }).name ?? "";
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
  /** What the unit measures; decides which units an ingredient may use. */
  dimension?: UnitDimension;
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
    .select("id, abbreviation, dimension")
    .eq("tenant_id", tenantId)
    .order("abbreviation", { ascending: true });

  if (error) throw asError(error, "The unit list could not be read.");
  return ((data ?? []) as unknown as { id: string; abbreviation: string; dimension?: unknown }[]).map(
    (row) => {
      const dimension = toUnitDimension(row.dimension);
      return { id: row.id, abbreviation: row.abbreviation, ...(dimension ? { dimension } : {}) };
    },
  );
}

/** The dish's base recipe id, creating the row if it has none. */
export async function ensureMenuItemRecipe(
  tenantId: string,
  menuItemId: string,
  db: Db = supabase,
): Promise<string> {
  return ensureRecipe(tenantId, { type: "menu_item", menuItemId }, db);
}

/**
 * The target's recipe id, creating the row if it has none.
 *
 * Finding-then-inserting rather than upserting keeps the common path a plain
 * read; the target's partial unique index (idx_recipes_menu_item_base_uq,
 * idx_recipes_modifier_option_uq, idx_recipes_option_uq, idx_recipes_addon_uq)
 * refuses a duplicate if two phones race, and that refusal surfaces like any
 * other failed insert. Only the target's own columns are written.
 */
export async function ensureRecipe(
  tenantId: string,
  target: RecipeTarget,
  db: Db = supabase,
): Promise<string> {
  const existing = await findRecipe(db, tenantId, target);
  if (existing) return existing.id;

  const columns = Object.fromEntries(
    Object.entries(buildRecipeTargetColumns(target)).filter(([, value]) => value !== null),
  );
  const { data, error } = await db
    .from("recipes")
    .insert({ tenant_id: tenantId, ...columns } as never)
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
  assertUsableLine(input, input.check);

  const { data, error } = await db
    .from("recipe_components")
    .insert({
      tenant_id: tenantId,
      recipe_id: input.recipeId,
      inventory_item_id: input.inventoryItemId,
      quantity: input.quantity,
      unit_id: input.unitId,
      sort_order: input.sortOrder,
    } as never)
    .select("id");

  if (error) throw asError(error, "The ingredient could not be added.");
  assertRowChanged(data, "The ingredient could not be added.");
}

/** Change a line's quantity or unit. */
export async function updateRecipeComponent(
  tenantId: string,
  componentId: string,
  changes: ComponentChanges,
  db: Db = supabase,
): Promise<void> {
  assertUsableLine(changes, changes.check);

  const { data, error } = await db
    .from("recipe_components")
    .update({ quantity: changes.quantity, unit_id: changes.unitId } as never)
    .eq("tenant_id", tenantId)
    .eq("id", componentId)
    .select("id");

  if (error) throw asError(error, "The ingredient could not be updated.");
  assertRowChanged(data, "The ingredient could not be updated.");
}

/** Remove a line. The recipe row stays; an empty recipe deducts nothing. */
export async function removeRecipeComponent(
  tenantId: string,
  componentId: string,
  db: Db = supabase,
): Promise<void> {
  const { data, error } = await db
    .from("recipe_components")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", componentId)
    .select("id");

  if (error) throw asError(error, "The ingredient could not be removed.");
  assertRowChanged(data, "The ingredient could not be removed.");
}

export interface DishRecipeChoices {
  /** Blank when the dish could not be read. */
  name: string;
  groups: OptionRecipeGroup[];
}

/**
 * The dish's name and every choice on it a recipe can attach to.
 *
 * Costs the choices, not the screen, on a failed read: the base recipe is
 * still editable without them.
 */
export async function loadDishRecipeChoices(
  tenantId: string,
  menuItemId: string,
  db: Db = supabase,
): Promise<DishRecipeChoices> {
  if (!tenantId || !menuItemId) return { name: "", groups: [] };

  const { data, error } = await db
    .from("menu_items")
    .select("name, modifier_groups, variation_types, variations, addons")
    .eq("tenant_id", tenantId)
    .eq("id", menuItemId)
    .maybeSingle();

  if (error || !data) return { name: "", groups: [] };
  const row = data as unknown as ModifierSource & { name: string | null };
  return { name: row.name ?? "", groups: dishRecipeChoices(menuItemId, row) };
}

interface RecipeKeyRow {
  id: string;
  target_type: string;
  variation_option_id: string | null;
  addon_id: string | null;
  modifier_option_id: string | null;
}

function rowTargetKey(row: RecipeKeyRow): string | null {
  switch (row.target_type) {
    case "menu_item":
      return "menu_item";
    case "modifier_option":
      return row.modifier_option_id ? `modifier_option:${row.modifier_option_id}` : null;
    case "variation_option":
      return row.variation_option_id ? `variation_option:${row.variation_option_id}` : null;
    case "addon":
      return row.addon_id ? `addon:${row.addon_id}` : null;
    default:
      return null;
  }
}

/**
 * How many ingredient lines each recipe on the dish has, keyed by
 * `targetKey` (`menu_item`, `modifier_option:<id>`, …). A target with no
 * recipe, or an empty one, is absent. Null when it could not be read — the
 * counts are labels and must not take the editor down with them.
 */
export async function loadDishRecipeCoverage(
  tenantId: string,
  menuItemId: string,
  db: Db = supabase,
): Promise<Record<string, number> | null> {
  if (!tenantId || !menuItemId) return null;

  const recipes = await db
    .from("recipes")
    .select("id, target_type, variation_option_id, addon_id, modifier_option_id")
    .eq("tenant_id", tenantId)
    .eq("menu_item_id", menuItemId);
  if (recipes.error) return null;

  const rows = (recipes.data ?? []) as unknown as RecipeKeyRow[];
  if (rows.length === 0) return {};

  const components = await db
    .from("recipe_components")
    .select("recipe_id")
    .eq("tenant_id", tenantId)
    .in(
      "recipe_id",
      rows.map((row) => row.id),
    );
  if (components.error) return null;

  const linesByRecipe = new Map<string, number>();
  for (const line of (components.data ?? []) as unknown as { recipe_id: string }[]) {
    linesByRecipe.set(line.recipe_id, (linesByRecipe.get(line.recipe_id) ?? 0) + 1);
  }

  return rows.reduce<Record<string, number>>((coverage, row) => {
    const key = rowTargetKey(row);
    const lines = linesByRecipe.get(row.id) ?? 0;
    return key && lines > 0 ? { ...coverage, [key]: lines } : coverage;
  }, {});
}

/** The coverage key of a target — re-exported so screens need one import. */
export { targetKey };
