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
import type { StockMovementReason } from "./daily-report/movement-reason";

const MOVEMENT_COLUMNS =
  "inventory_item_id, reason, quantity_delta, balance_after, created_at";
const ITEM_COLUMNS = "id, name, unit_cost, stock_unit_id";

export interface DailyReportForDay extends DailyInventoryReport {
  /** The Manila day this covers, `YYYY-MM-DD`. */
  dayKey: string;
}

interface MovementRow {
  inventory_item_id: string;
  reason: StockMovementReason;
  quantity_delta: number;
  balance_after: number;
  created_at: string;
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

    const [movementResult, itemResult, unitResult] = await Promise.all([
      db
        .from("stock_movements")
        .select(MOVEMENT_COLUMNS)
        .eq("tenant_id", tenantId)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true }),
      db.from("inventory_items").select(ITEM_COLUMNS).eq("tenant_id", tenantId),
      db.from("inventory_units").select("id, abbreviation").eq("tenant_id", tenantId),
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

    return { dayKey, ...buildDailyInventoryReport({ movements, ingredients }) };
  } catch (error) {
    console.warn("[inventory] daily report unavailable", { tenantId, dayKey, error });
    return null;
  }
}
