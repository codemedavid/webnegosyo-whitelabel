/**
 * Reading one Manila day of the ledger for the merchant app.
 *
 * Inventory lives in the PLATFORM Supabase for every tenant regardless of where
 * their orders live — the same reasoning as lib/inventory-service.ts — so this
 * is a plain Supabase read carrying the merchant's own session, not a Convex
 * query and not a service role.
 *
 * All arithmetic and wording come from lib/daily-report/, which is a
 * parity-guarded copy of the web core. That is the point: a report that graded
 * a day differently on the phone than on the web would leave a merchant with
 * two verdicts about one day and no way to choose.
 *
 * Returns `null` rather than an empty report on ANY failure. An empty report
 * reads as "nothing moved today", which on a phone with a poor connection is
 * the most misleading thing this screen could say.
 */

import { supabase } from "./supabase";
import {
  buildDailyInventoryReport,
  type DailyInventoryReport,
  type DailyReportIngredient,
  type DailyReportMovement,
} from "./daily-report/daily-report";
import { resolveBusinessDayWindow } from "./daily-report/business-day";
import { judgeCountSession, type CountSessionProgress } from "./daily-report/count-session";
import type { StockMovementReason } from "./daily-report/movement-reason";

const MOVEMENT_COLUMNS =
  "inventory_item_id, reason, quantity_delta, balance_after, created_at, inventory_count_id";
const ITEM_COLUMNS = "id, name, unit_cost, stock_unit_id";

export interface DailyReportForDay extends DailyInventoryReport {
  /** The Manila day this covers, `YYYY-MM-DD`. */
  dayKey: string;
  /**
   * How far the day's stock count got, or `null` when nobody opened one.
   *
   * `null` means "no count session", NOT "an abandoned count" — every day
   * before sessions existed looks like this, as does every tenant who counts
   * without opening one.
   */
  countSession: CountSessionProgress | null;
}

interface CountRow {
  id: string;
  expected_item_count: number;
  closed_at: string | null;
}

interface MovementRow {
  inventory_item_id: string;
  reason: StockMovementReason;
  quantity_delta: number;
  balance_after: number;
  created_at: string;
  inventory_count_id: string | null;
}

interface ItemRow {
  id: string;
  name: string;
  unit_cost: number | null;
  stock_unit_id: string;
}

interface UnitRow {
  id: string;
  abbreviation: string;
}

/** Injected in tests so no connection is opened. */
type Db = Pick<typeof supabase, "from">;

/**
 * The day's report, or `null` when it could not be built.
 *
 * The window is half-open (`>= start`, `< end`) so consecutive days tile the
 * timeline and no movement is counted twice — the same boundary the web report
 * and the daily order numbers use.
 */
export async function loadDailyReport(
  tenantId: string,
  dayKey: string,
  db: Db = supabase,
): Promise<DailyReportForDay | null> {
  // The auth store starts empty — a cold mount must not query for every tenant.
  if (!tenantId) return null;

  try {
    const { startIso, endIso } = resolveBusinessDayWindow(dayKey);

    const [movementResult, itemResult, unitResult, countResult] = await Promise.all([
      db
        .from("stock_movements")
        .select(MOVEMENT_COLUMNS)
        .eq("tenant_id", tenantId)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true }),
      db.from("inventory_items").select(ITEM_COLUMNS).eq("tenant_id", tenantId),
      db.from("inventory_units").select("id, abbreviation").eq("tenant_id", tenantId),
      // The day's count, if one was opened. Latest first, because a shelf
      // recounted in the evening describes how the day ended — the morning's
      // abandoned attempt is not the last word on it.
      db
        .from("inventory_counts")
        .select("id, expected_item_count, closed_at")
        .eq("tenant_id", tenantId)
        .eq("business_day", dayKey)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (movementResult.error) throw movementResult.error;
    if (itemResult.error) throw itemResult.error;

    // A unit catalog that cannot be read costs the suffix, not the day —
    // matching loadInventoryStock.
    const units = (unitResult.error ? [] : unitResult.data ?? []) as unknown as UnitRow[];
    const abbreviationById = new Map(units.map((unit) => [unit.id, unit.abbreviation]));

    const ingredients: DailyReportIngredient[] = (
      (itemResult.data ?? []) as unknown as ItemRow[]
    ).map((row) => ({
      id: row.id,
      name: row.name,
      // A null cost is "never priced", which the report counts and reports
      // rather than quietly treating as free.
      unitCost: row.unit_cost ?? 0,
      stockUnitAbbreviation: abbreviationById.get(row.stock_unit_id) ?? "",
    }));

    const movements: DailyReportMovement[] = (
      (movementResult.data ?? []) as unknown as MovementRow[]
    ).map((row) => ({
      inventoryItemId: row.inventory_item_id,
      reason: row.reason,
      quantityDelta: row.quantity_delta,
      balanceAfter: row.balance_after,
      createdAt: row.created_at,
    }));

    return {
      dayKey,
      countSession: judgeDaysCount(
        countResult.error ? null : ((countResult.data as unknown as CountRow) ?? null),
        (movementResult.data ?? []) as unknown as MovementRow[],
      ),
      ...buildDailyInventoryReport({ movements, ingredients }),
    };
  } catch (error) {
    console.warn("[inventory] daily report unavailable", { tenantId, dayKey, error });
    return null;
  }
}

/**
 * How far the day's count got, from the movements filed under it.
 *
 * The counted ingredients come from the movements already read for the report
 * rather than a second query — they are the same rows.
 *
 * A stocktake carrying no session is deliberately not credited: a one-off
 * correction made during a count is not part of the count, and crediting it
 * would raise coverage for an ingredient nobody counted.
 *
 * A failed session read yields `null` rather than throwing. The stock figures
 * are independently true, and losing the whole report because its caveat could
 * not be computed would be a worse trade than losing the caveat.
 */
function judgeDaysCount(
  count: CountRow | null,
  movements: readonly MovementRow[],
): CountSessionProgress | null {
  if (!count) return null;

  return judgeCountSession({
    expectedItemCount: Number(count.expected_item_count),
    countedItemIds: movements
      .filter((row) => row.inventory_count_id === count.id)
      .map((row) => row.inventory_item_id),
    closedAt: count.closed_at,
  });
}

interface RecipeRow {
  id: string;
  target_type: string;
  menu_item_id: string | null;
}

/**
 * How many dishes actually take stock off the shelf when they sell.
 *
 * The verdict refuses to grade a day when this is zero, and that refusal is
 * the feature: a tenant with no recipes gets zero usage and zero shrinkage,
 * which reads as a flawless day forever.
 *
 * `undefined` means "could not tell" and withholds the verdict; `0` is the
 * finding "no dish has a recipe", which the verdict says out loud. Collapsing
 * the two would let a dropped connection state something untrue about the
 * merchant's setup.
 *
 * A dish counts only if its recipe lists at least one ingredient — the same
 * rule as `hasRecipe: ingredientCount > 0` in the web's recipe-coverage.ts. An
 * empty recipe deducts nothing, so it is a recipe nobody finished.
 */
export async function countDishesWithRecipe(
  tenantId: string,
  db: Db = supabase,
): Promise<number | undefined> {
  if (!tenantId) return undefined;

  try {
    const [recipeResult, componentResult] = await Promise.all([
      db.from("recipes").select("id, target_type, menu_item_id").eq("tenant_id", tenantId),
      db.from("recipe_components").select("recipe_id").eq("tenant_id", tenantId),
    ]);

    if (recipeResult.error) throw recipeResult.error;
    if (componentResult.error) throw componentResult.error;

    const recipesWithIngredients = new Set(
      ((componentResult.data ?? []) as unknown as { recipe_id: string }[]).map(
        (row) => row.recipe_id,
      ),
    );

    const dishes = new Set(
      ((recipeResult.data ?? []) as unknown as RecipeRow[])
        .filter(
          (row) =>
            row.target_type === "menu_item" &&
            row.menu_item_id !== null &&
            recipesWithIngredients.has(row.id),
        )
        // A dish can hold more than one recipe row; the question is whether it
        // is covered at all, so it is counted once.
        .map((row) => row.menu_item_id as string),
    );

    return dishes.size;
  } catch (error) {
    console.warn("[inventory] recipe coverage unavailable", { tenantId, error });
    return undefined;
  }
}
