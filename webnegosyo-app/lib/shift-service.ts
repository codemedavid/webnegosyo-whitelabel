/**
 * Opening, reading and closing a shift from the register.
 *
 * THE PHONE IS THE REGISTER, so the shift starts and ends where the money
 * does. Like a stock count session — and unlike an order — a shift moves no
 * money itself: it records the ACT of holding the drawer, while the orders it
 * brackets record the money. So it writes straight to Supabase, and
 * `staff_shifts` RLS (migration 20260823120000) confines the writer to the
 * branches they may reach — the count-session-service.ts precedent, for the
 * same reason: a route would add a hop and no boundary.
 *
 * The drawer arithmetic lives in shift.ts; this module only owns the rows.
 */

import { supabase } from "./supabase";
import { validateCashAmount } from "./shift";

/** Injected in tests so no connection is opened. */
type Db = Pick<typeof supabase, "from">;

const SHIFT_COLUMNS =
  "id, tenant_id, outlet_id, staff_user_id, staff_name, status, opening_float, expected_cash, closing_count, note, opened_at, closed_at";

/** One shift, as the screens consume it. */
export interface ShiftRecord {
  id: string;
  outletId: string | null;
  staffUserId: string | null;
  /** Snapshotted at clock-in so deleting the account keeps the history named. */
  staffName: string;
  status: "open" | "closed";
  openingFloat: number;
  /** Expected cash in the drawer, recorded at close. Null while open. */
  expectedCash: number | null;
  /** What the drawer actually held when counted. Null while open. */
  closingCount: number | null;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
}

interface ShiftRow {
  id: string;
  outlet_id: string | null;
  staff_user_id: string | null;
  staff_name: string | null;
  status: string;
  opening_float: number | string;
  expected_cash: number | string | null;
  closing_count: number | string | null;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
}

/**
 * Same rethrow rule as count-session-service.ts: Supabase rejects with a
 * plain object, and rethrown as-is it reaches the screen with no `message`,
 * so the cashier sees an empty alert for a write that did not happen.
 */
function asError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message ? `${fallback} (${error.message})` : fallback);
}

/** Numeric columns arrive as strings from Postgres; the screens need numbers. */
function toShift(row: ShiftRow): ShiftRecord {
  return {
    id: row.id,
    outletId: row.outlet_id,
    staffUserId: row.staff_user_id,
    staffName: row.staff_name ?? "Staff",
    status: row.status === "closed" ? "closed" : "open",
    openingFloat: Number(row.opening_float),
    expectedCash: row.expected_cash === null ? null : Number(row.expected_cash),
    closingCount: row.closing_count === null ? null : Number(row.closing_count),
    note: row.note,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

async function findOpenShift(
  db: Db,
  tenantId: string,
  staffUserId: string,
): Promise<ShiftRow | null> {
  const { data, error } = await db
    .from("staff_shifts")
    .select(SHIFT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("staff_user_id", staffUserId)
    .eq("status", "open")
    .maybeSingle();

  if (error) throw asError(error, "The running shift could not be read.");
  return (data as unknown as ShiftRow) ?? null;
}

/**
 * The shift this staff member is running, or `null` when they are not.
 *
 * A FAILED READ ALSO YIELDS `null`, which is safe only because `openShift`
 * joins a running shift rather than opening a second: the worst a dropped
 * connection can do is offer "Start shift" to someone already on one, and
 * pressing it joins that shift. Throwing would cost the whole register screen
 * over a caveat.
 */
export async function loadOpenShift(
  tenantId: string,
  staffUserId: string,
  db: Db = supabase,
): Promise<ShiftRecord | null> {
  if (!tenantId || !staffUserId) return null;

  try {
    const row = await findOpenShift(db, tenantId, staffUserId);
    return row ? toShift(row) : null;
  } catch (error) {
    console.warn("[shift] open shift unavailable", { tenantId, error });
    return null;
  }
}

export interface OpenShiftInput {
  /** `null` is the unbranched store — a real register, not an absent one. */
  outletId: string | null;
  staffUserId: string;
  /** Snapshotted onto the row; see ShiftRecord.staffName. */
  staffName: string;
  /** Cash in the drawer before the first sale. */
  openingFloat: number;
}

/**
 * Clock in, or join the shift already running.
 *
 * JOINING RATHER THAN REFUSING, like openCount: two open shifts for one
 * person is two drawers for one pair of hands, and each would then reconcile
 * against half the takings. The unique partial index refuses the second row
 * anyway; this makes the app's behaviour deliberate rather than an error.
 *
 * Throws on failure, unlike the read — the cashier is watching, and a silent
 * failure would have them ringing sales into a shift that does not exist.
 */
export async function openShift(
  tenantId: string,
  input: OpenShiftInput,
  db: Db = supabase,
): Promise<ShiftRecord> {
  const float = validateCashAmount(input.openingFloat);
  if (!float.ok) throw new Error(float.reason);

  const existing = await findOpenShift(db, tenantId, input.staffUserId);
  if (existing) return toShift(existing);

  const { data, error } = await db
    .from("staff_shifts")
    .insert({
      tenant_id: tenantId,
      outlet_id: input.outletId,
      staff_user_id: input.staffUserId,
      staff_name: input.staffName,
      status: "open",
      opening_float: float.amount,
    } as never)
    .select(SHIFT_COLUMNS)
    .single();

  if (error) throw asError(error, "The shift could not be started.");
  if (!data) throw new Error("The shift could not be started. Try again.");

  return toShift(data as unknown as ShiftRow);
}

export interface CloseShiftInput {
  /** What the drawer held when counted. */
  closingCount: number;
  /** What shift-drawer.ts said it should hold, frozen at the moment of close. */
  expectedCash: number;
  note: string | null;
}

/**
 * Clock out, recording both sides of the reconciliation.
 *
 * `expectedCash` is stored rather than recomputed later: the expectation is
 * evidence, and re-deriving it months on — after orders were edited or
 * refunded — would quietly rewrite whether a drawer balanced.
 *
 * Scoped to tenant AND id AND still-open, not RLS alone — the closeCount
 * belt-and-braces, so a copy of this query without RLS behind it stays safe.
 */
export async function closeShift(
  tenantId: string,
  shiftId: string,
  input: CloseShiftInput,
  db: Db = supabase,
): Promise<void> {
  const counted = validateCashAmount(input.closingCount);
  if (!counted.ok) throw new Error(counted.reason);

  if (!Number.isFinite(input.expectedCash)) throw new Error("Expected cash must be a finite amount.");
  const { data, error } = await db
    .from("staff_shifts")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closing_count: counted.amount,
      expected_cash: input.expectedCash,
      note: input.note,
    } as never)
    .eq("tenant_id", tenantId)
    .eq("id", shiftId)
    .eq("status", "open")
    .select("id")
    .single();

  if (error || !data) throw asError(error, "The shift could not be closed.");
}

export interface ListShiftsFilter {
  /** Narrow to one branch. Omit for the whole store. */
  outletId?: string | null;
  /** Narrow to one person. Omit for everyone. */
  staffUserId?: string;
  /** Only shifts opened at or after this instant. */
  sinceIso?: string;
}

/**
 * The store's shifts, newest first, for the owner's review.
 *
 * THROWS on failure, unlike loadOpenShift: an empty history reads as a clean
 * one, and an owner shown "no shifts" for a week that had ten would conclude
 * nobody worked rather than that the read failed.
 */
export async function listShifts(
  tenantId: string,
  filter: ListShiftsFilter,
  db: Db = supabase,
): Promise<ShiftRecord[]> {
  let query = db
    .from("staff_shifts")
    .select(SHIFT_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("opened_at", { ascending: false });

  if (filter.staffUserId) query = query.eq("staff_user_id", filter.staffUserId);
  if (filter.outletId !== undefined && filter.outletId !== null) {
    query = query.eq("outlet_id", filter.outletId);
  }
  if (filter.sinceIso) query = query.gte("opened_at", filter.sinceIso);

  const { data, error } = await query;
  if (error) throw asError(error, "The shift history could not be read.");

  return ((data ?? []) as unknown as ShiftRow[]).map(toShift);
}
