/**
 * Reading and writing tills and cash moves.
 *
 * Straight to Supabase, like shift-service.ts: a till and a cash move record
 * acts on the drawer, not money in the order ledger, and RLS (migration
 * 20261001120000) is the boundary — only a cash manager may set up tills, and
 * a move lands only on an OPEN shift the writer holds or manages. The rules
 * the screen checks first live in cash-drawers.ts.
 */

import { supabase } from "./supabase";
import { withDeadline } from "./offline/deadline";
import {
  validateCashMove,
  validateDrawerInput,
  type CashDrawer,
  type CashMove,
  type CashMoveInput,
  type CashMoveKind,
  type DrawerInput,
} from "./cash-drawers";

const REQUEST_MS = 15_000;

type Db = Pick<typeof supabase, "from">;

const DRAWER_COLUMNS = "id, outlet_id, name, starting_cash, is_zero_balance, sort_order";
const MOVE_COLUMNS = "id, shift_id, kind, amount, reason, recorded_by_name, created_at";

interface DrawerRow {
  id: string;
  outlet_id: string | null;
  name: string;
  starting_cash: number | string;
  is_zero_balance: boolean;
  sort_order: number;
}

interface MoveRow {
  id: string;
  shift_id: string;
  kind: string;
  amount: number | string;
  reason: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

function asError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message ? `${fallback} (${error.message})` : fallback);
}

function toDrawer(row: DrawerRow): CashDrawer {
  return {
    id: row.id,
    outletId: row.outlet_id,
    name: row.name,
    startingCash: Number(row.starting_cash),
    isZeroBalance: row.is_zero_balance === true,
    sortOrder: row.sort_order ?? 0,
  };
}

function toMove(row: MoveRow): CashMove {
  return {
    id: row.id,
    shiftId: row.shift_id,
    kind: row.kind as CashMoveKind,
    amount: Number(row.amount),
    reason: row.reason,
    recordedByName: row.recorded_by_name ?? "Staff",
    createdAt: row.created_at,
  };
}

/**
 * The live tills of one branch (null = the unbranched store).
 *
 * THROWS: an empty list means "this store uses personal drawers", so a failed
 * read must not be mistaken for one.
 */
export async function listDrawers(
  tenantId: string,
  outletId: string | null,
  db: Db = supabase,
): Promise<CashDrawer[]> {
  let query = db
    .from("cash_drawers")
    .select(DRAWER_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  query = outletId === null ? query.is("outlet_id", null) : query.eq("outlet_id", outletId);

  const { data, error } = await withDeadline(Promise.resolve(query), REQUEST_MS);
  if (error) throw asError(error, "The drawers could not be read.");
  return ((data ?? []) as unknown as DrawerRow[]).map(toDrawer);
}

/** Readable text for the two refusals an owner can fix. */
function describeDrawerRefusal(error: { code?: string; message?: string }, fallback: string): Error {
  if (error.code === "23505") return new Error("There is already a drawer with that name.");
  if (error.code === "42501") return new Error("Only the owner or a manager can set up drawers.");
  return asError(error, fallback);
}

export async function createDrawer(
  tenantId: string,
  outletId: string | null,
  input: DrawerInput,
  siblings: readonly CashDrawer[],
  db: Db = supabase,
): Promise<CashDrawer> {
  const verdict = validateDrawerInput(input, siblings);
  if (!verdict.ok) throw new Error(verdict.reason);
  const sortOrder = siblings.reduce((max, d) => Math.max(max, d.sortOrder), -1) + 1;

  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("cash_drawers")
        .insert({
          tenant_id: tenantId,
          outlet_id: outletId,
          name: verdict.value.name,
          starting_cash: verdict.value.startingCash,
          is_zero_balance: verdict.value.isZeroBalance,
          sort_order: sortOrder,
        } as never)
        .select(DRAWER_COLUMNS)
        .single(),
    ),
    REQUEST_MS,
  );
  if (error) throw describeDrawerRefusal(error, "The drawer could not be added.");
  if (!data) throw new Error("The drawer could not be added. Try again.");
  return toDrawer(data as unknown as DrawerRow);
}

/**
 * Rename or re-policy a till. A shift already running on it keeps the name
 * and policy it clocked in under (snapshotted on the shift) — the change
 * applies from the next clock-in.
 */
export async function updateDrawer(
  tenantId: string,
  drawerId: string,
  input: DrawerInput,
  siblings: readonly CashDrawer[],
  db: Db = supabase,
): Promise<CashDrawer> {
  const verdict = validateDrawerInput(input, siblings, drawerId);
  if (!verdict.ok) throw new Error(verdict.reason);

  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("cash_drawers")
        .update({
          name: verdict.value.name,
          starting_cash: verdict.value.startingCash,
          is_zero_balance: verdict.value.isZeroBalance,
        } as never)
        .eq("tenant_id", tenantId)
        .eq("id", drawerId)
        .select(DRAWER_COLUMNS)
        .single(),
    ),
    REQUEST_MS,
  );
  if (error || !data) throw describeDrawerRefusal(error ?? {}, "The drawer could not be saved.");
  return toDrawer(data as unknown as DrawerRow);
}

/** Archived, never deleted: closed shifts point at it as evidence. */
export async function archiveDrawer(tenantId: string, drawerId: string, db: Db = supabase): Promise<void> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("cash_drawers")
        .update({ archived_at: new Date().toISOString() } as never)
        .eq("tenant_id", tenantId)
        .eq("id", drawerId)
        .select("id")
        .single(),
    ),
    REQUEST_MS,
  );
  if (error || !data) throw describeDrawerRefusal(error ?? {}, "The drawer could not be removed.");
}

/** Cash moves for the given shifts, oldest first. Throws: a missing pickup reads as a shortage. */
export async function listCashMoves(
  tenantId: string,
  shiftIds: readonly string[],
  db: Db = supabase,
): Promise<CashMove[]> {
  if (shiftIds.length === 0) return [];
  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("shift_cash_movements")
        .select(MOVE_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("shift_id", [...shiftIds])
        .order("created_at", { ascending: true }),
    ),
    REQUEST_MS,
  );
  if (error) throw asError(error, "The drawer's cash moves could not be read.");
  return ((data ?? []) as unknown as MoveRow[]).map(toMove);
}

export interface RecordCashMoveInput extends CashMoveInput {
  shiftId: string;
  recordedByName: string;
  /** What the drawer should hold now, to refuse a pickup bigger than it. Null = unknown. */
  expectedInDrawer: number | null;
}

/** Record a pay in, pay out or pickup on an OPEN shift. Throws on refusal. */
export async function recordCashMove(
  tenantId: string,
  input: RecordCashMoveInput,
  db: Db = supabase,
): Promise<CashMove> {
  const verdict = validateCashMove(input, input.expectedInDrawer);
  if (!verdict.ok) throw new Error(verdict.reason);

  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("shift_cash_movements")
        .insert({
          tenant_id: tenantId,
          shift_id: input.shiftId,
          kind: verdict.value.kind,
          amount: verdict.value.amount,
          reason: verdict.value.reason,
          recorded_by_name: input.recordedByName,
        } as never)
        .select(MOVE_COLUMNS)
        .single(),
    ),
    REQUEST_MS,
  );
  if (error) {
    if (/already closed/i.test(error.message ?? "")) throw new Error("That shift has already ended.");
    if (error.code === "42501") throw new Error("You can only move cash in your own drawer.");
    throw asError(error, "The cash move could not be recorded.");
  }
  if (!data) throw new Error("The cash move could not be recorded. Try again.");
  return toMove(data as unknown as MoveRow);
}
