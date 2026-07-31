/**
 * Opening, reading and closing a stock count from the merchant's phone.
 *
 * THE PHONE IS WHERE A COUNT HAPPENS. The merchant is standing at the shelf
 * with the sack in their hands. Until this existed the app could see that a
 * count was running but not start or finish one, which meant walking to a
 * laptop — and the walk is exactly where a count gets abandoned.
 *
 * WHY THIS WRITES DIRECTLY, when lib/inventory-movement-service.ts deliberately
 * does not. A movement needs the platform: the signed delta is resolved against
 * the on-hand quantity read in the same request, a delivery's price blends into
 * the moving average, and crossing the reorder line raises alerts and can 86 a
 * dish. A count SESSION does none of that — it records the ACT of counting,
 * while `stock_movements` records its effect — and `inventory_counts` RLS
 * (migration 20260812120000) already confines a writer to the branches they may
 * reach. A route here would add a hop and no boundary.
 *
 * The rules are the web's, from lib/daily-report/count-session.ts, so a count
 * that reads as half-finished on the phone reads as half-finished on the web.
 * Only the persistence is written twice, and only because the app cannot import
 * from `src/`.
 */

import { supabase } from "./supabase";
import { judgeCountSession, type CountSessionProgress } from "./daily-report/count-session";
import { toBusinessDayKey } from "./daily-report/business-day";

/** Injected in tests so no connection is opened. */
type Db = Pick<typeof supabase, "from">;

const COUNT_COLUMNS = "id, outlet_id, business_day, expected_item_count, closed_at";

export interface OpenCountSession {
  id: string;
  /** How far it has got, judged by the same rules the web report uses. */
  progress: CountSessionProgress;
}

export interface OpenCountInput {
  /** `null` is the unbranched store pool — a real shelf, not an absent one. */
  outletId: string | null;
  /** Shrinkage is only actionable against a person and a time. */
  startedBy: string | null;
}

interface CountRow {
  id: string;
  expected_item_count: number;
  closed_at: string | null;
}

/**
 * Turn a Supabase error into one the merchant can be shown.
 *
 * Supabase rejects with a plain object, not an `Error`. Rethrown as-is it
 * survives as far as the screen and arrives with no `message` to render, so the
 * merchant sees an empty alert for a write that did not happen. The reason is
 * kept — "new row violates row-level security policy" tells them they are on
 * the wrong branch, where a generic failure tells them nothing.
 */
function asError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message ? `${fallback} (${error.message})` : fallback);
}

/** Distinct ingredients this session has reached. */
async function countedItemIds(db: Db, countId: string): Promise<string[]> {
  const { data, error } = await db
    .from("stock_movements")
    .select("inventory_item_id")
    .eq("inventory_count_id", countId);

  if (error) throw asError(error, "The stock count's progress could not be read.");
  return ((data ?? []) as unknown as { inventory_item_id: string }[]).map(
    (row) => row.inventory_item_id,
  );
}

async function progressOf(db: Db, count: CountRow): Promise<OpenCountSession> {
  return {
    id: count.id,
    progress: judgeCountSession({
      expectedItemCount: Number(count.expected_item_count),
      countedItemIds: await countedItemIds(db, count.id),
      closedAt: count.closed_at,
    }),
  };
}

/** The count running on this shelf, if there is one. */
async function findOpenCount(
  db: Db,
  tenantId: string,
  outletId: string | null,
): Promise<CountRow | null> {
  const query = db
    .from("inventory_counts")
    .select(COUNT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "open");

  // `outlet_id = NULL` matches nothing in SQL, so the store pool has to be
  // asked for with IS NULL — it is a real shelf, not an absent one. Getting
  // this wrong would hide every unbranched tenant's running count and offer to
  // start a second on top of it.
  const scoped = outletId === null ? query.is("outlet_id", null) : query.eq("outlet_id", outletId);

  const { data, error } = await scoped.maybeSingle();
  if (error) throw asError(error, "The running stock count could not be read.");
  return (data as unknown as CountRow) ?? null;
}

/**
 * The running count and how far it has got, or `null` when there is none.
 *
 * A FAILED READ ALSO YIELDS `null`, which is safe only because `openCount`
 * joins a running count rather than opening a second: the worst a dropped
 * connection can do here is offer "Start stock count" for a count that is
 * already running, and pressing it joins that count. Throwing instead would
 * cost the merchant the whole screen over a caveat.
 */
export async function loadOpenCount(
  tenantId: string,
  outletId: string | null,
  db: Db = supabase,
): Promise<OpenCountSession | null> {
  if (!tenantId) return null;

  try {
    const count = await findOpenCount(db, tenantId, outletId);
    return count ? await progressOf(db, count) : null;
  } catch (error) {
    console.warn("[inventory] count session unavailable", { tenantId, error });
    return null;
  }
}

/**
 * Ingredients in scope right now — the denominator, snapshotted.
 *
 * Only ACTIVE ones. A count cannot reach an ingredient the store no longer
 * stocks, so counting it in scope would cap coverage below 100 forever and
 * teach the merchant that a complete count is unachievable.
 */
async function countIngredientsInScope(db: Db, tenantId: string): Promise<number> {
  const { data, error } = await db
    .from("inventory_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) throw asError(error, "The ingredients to count could not be read.");
  return (data ?? []).length;
}

/**
 * Start a count, or join the one already running on this shelf.
 *
 * JOINING RATHER THAN REFUSING is the point. Two open sessions mean two people
 * counting the same sack into different documents, and each would then report
 * partial coverage of a shelf that was in fact counted twice over. The database
 * refuses the second one anyway (unique partial index); this makes the app's
 * behaviour deliberate rather than an error message.
 *
 * Throws on failure, unlike the read: the merchant is watching, and a silent
 * failure would have them counting a shelf into a session that does not exist.
 */
export async function openCount(
  tenantId: string,
  input: OpenCountInput,
  db: Db = supabase,
): Promise<OpenCountSession> {
  const existing = await findOpenCount(db, tenantId, input.outletId);
  if (existing) return progressOf(db, existing);

  const { data, error } = await db
    .from("inventory_counts")
    .insert({
      tenant_id: tenantId,
      outlet_id: input.outletId,
      business_day: toBusinessDayKey(new Date().toISOString()),
      status: "open",
      expected_item_count: await countIngredientsInScope(db, tenantId),
      started_by: input.startedBy,
    } as never)
    .select(COUNT_COLUMNS)
    .single();

  if (error) throw asError(error, "The stock count could not be started.");
  if (!data) throw new Error("The stock count could not be started. Try again.");

  return progressOf(db, data as unknown as CountRow);
}

/**
 * Declare the count over.
 *
 * Scoped to the tenant as well as the id. RLS would refuse a stranger's count,
 * but a query that relies on RLS to be correct reads as though it did not need
 * to be, and the next person to copy it may not have RLS behind them.
 */
export async function closeCount(
  tenantId: string,
  countId: string,
  closedBy: string | null,
  db: Db = supabase,
): Promise<void> {
  const { error } = await db
    .from("inventory_counts")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
    } as never)
    .eq("tenant_id", tenantId)
    .eq("id", countId)
    .eq("status", "open");

  if (error) throw asError(error, "The stock count could not be closed.");
}
