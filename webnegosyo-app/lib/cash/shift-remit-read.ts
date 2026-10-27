/**
 * Reads behind the remittance slip screen: one remittance by id (with its
 * shift's close, the same columns the inbox reads), and the shift's cash
 * moves with who took each pickup. RLS decides who may read them; a failed
 * read THROWS so the screen says so instead of drawing an empty slip.
 */

import { useCallback } from "react";

import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { withDeadline } from "../offline/deadline";
import { useResource } from "../query/use-resource";
import { describeCashError, type CashDb, type DbError } from "./settings";
import { REMITTANCE_COLUMNS, parseRemittance, type Remittance } from "./remittances";
import { liveCashDb } from "./use-cash-rules";
import type { SlipMove } from "./shift-remit-slip";
import { parseCountAttempts, type CountAttempt } from "./shift-recount";

const REQUEST_MS = 15_000;

// The inbox's columns, one definition (lib/cash/remittances.ts); re-exported
// so shift-remit-read.test.ts keeps pinning them to the migration.
export { REMITTANCE_COLUMNS };

export const SLIP_NOT_FOUND = "This slip isn't here. It may belong to a branch this account can't see.";

export async function fetchRemittance(db: CashDb, tenantId: string, id: string): Promise<Remittance | null> {
  const { data, error } = await withDeadline(
    Promise.resolve(db.from("cash_remittances").select(REMITTANCE_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle()),
    REQUEST_MS,
  );
  if (error) throw describeCashError(error as DbError, "The slip could not be read.");
  return data ? parseRemittance(data) : null;
}

export const SLIP_MOVE_COLUMNS = "kind, amount, created_at, taken_by_name";

const MOVE_KINDS = new Set(["pay_in", "pay_out", "collect"]);

function toSlipMoves(rows: unknown): SlipMove[] {
  return ((rows ?? []) as Record<string, unknown>[]).flatMap((row): SlipMove[] => {
    if (!MOVE_KINDS.has(row.kind as string)) return [];
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) return [];
    return [
      {
        kind: row.kind as SlipMove["kind"],
        // Legacy shift_cash_movements money is pesos (numeric).
        cents: Math.round(amount * 100),
        at: typeof row.created_at === "string" ? row.created_at : "",
        takenByName: typeof row.taken_by_name === "string" && row.taken_by_name.trim() ? row.taken_by_name : null,
      },
    ];
  });
}

/** The shift's moves, oldest first; `taken_by_name` is read only once the pickup columns exist. */
export async function fetchSlipMoves(db: CashDb, tenantId: string, shiftId: string): Promise<SlipMove[]> {
  const read = (columns: string) =>
    withDeadline(
      Promise.resolve(
        db.from("shift_cash_movements").select(columns).eq("tenant_id", tenantId).eq("shift_id", shiftId).order("created_at", { ascending: true }),
      ),
      REQUEST_MS,
    ) as Promise<{ data: unknown; error: DbError | null }>;
  let answer = await read(SLIP_MOVE_COLUMNS);
  // 42703 = no such column: the pickups migration is not applied yet.
  if (answer.error?.code === "42703") answer = await read("kind, amount, created_at");
  if (answer.error) throw describeCashError(answer.error, "The drawer's cash moves could not be read.");
  return toSlipMoves(answer.data);
}

export const REMITTANCE_SLIP_RESOURCE = "cash-remittance-slip";

export function useRemittance(id: string | null) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const fetcher = useCallback(() => fetchRemittance(liveCashDb, tenantId as string, id as string), [tenantId, id]);
  return useResource<Remittance | null>(tenantId && id ? resourceKey(REMITTANCE_SLIP_RESOURCE, tenantId, id) : null, fetcher, { staleTime: 10_000 });
}

export function useSlipMoves(shiftId: string | null) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const fetcher = useCallback(() => fetchSlipMoves(liveCashDb, tenantId as string, shiftId as string), [tenantId, shiftId]);
  return useResource<SlipMove[]>(tenantId && shiftId ? resourceKey(REMITTANCE_SLIP_RESOURCE, tenantId, "moves", shiftId) : null, fetcher, {
    staleTime: 60_000,
  });
}

export const SLIP_COUNT_COLUMNS = "attempt, counted_cents";

/** Every count of the shift (one, or two after a recount). RLS: the holder or a cash manager. */
export async function fetchSlipCounts(db: CashDb, tenantId: string, shiftId: string): Promise<CountAttempt[]> {
  const { data, error } = (await withDeadline(
    Promise.resolve(db.from("shift_counts").select(SLIP_COUNT_COLUMNS).eq("tenant_id", tenantId).eq("shift_id", shiftId).order("attempt", { ascending: true })),
    REQUEST_MS,
  )) as { data: unknown; error: DbError | null };
  if (error) throw describeCashError(error, "The drawer's counts could not be read.");
  return parseCountAttempts(data);
}

export function useSlipCounts(shiftId: string | null) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const fetcher = useCallback(() => fetchSlipCounts(liveCashDb, tenantId as string, shiftId as string), [tenantId, shiftId]);
  return useResource<CountAttempt[]>(tenantId && shiftId ? resourceKey(REMITTANCE_SLIP_RESOURCE, tenantId, "counts", shiftId) : null, fetcher, {
    staleTime: 60_000,
  });
}
