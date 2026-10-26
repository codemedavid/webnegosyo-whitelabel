/**
 * Named shifts ("Day shift 12 PM–8 PM", "Night shift 8 PM–2 AM") as stored in
 * `service_periods` (CONTRACTS §2). Standard term in POS reporting; the UI
 * calls them "Shifts". Optional: a store without any reports each clocked-in
 * shift on its own.
 *
 * RLS is the boundary — store members read (with branch reach), `cash_manage`
 * writes. A refusal under RLS is an EMPTY answer, not an error, so every write
 * asks for the rows back and fails when none came. Archived, never deleted:
 * closed shifts and past reports point at them.
 *
 * Which business day a period belongs to, and its window, live in bizday's
 * `lib/business-day/service-periods.ts`; this module only stores the times.
 */

import { withDeadline } from "../offline/deadline";
import { describeCashError, type CashDb, type DbError } from "./settings";

const REQUEST_MS = 15_000;
const MINUTES_PER_DAY = 24 * 60;
/** Ceiling on a store's live shifts; a store with more is a data problem, not a schedule. */
const MAX_PERIODS = 200;
export const SERVICE_PERIOD_NAME_MAX = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ServicePeriod {
  id: string;
  tenantId: string;
  /** null = every branch. */
  outletId: string | null;
  name: string;
  /** Manila wall-clock minutes, 0..1439. */
  startsMinutes: number;
  /** <= startsMinutes means it ends the next day. */
  endsMinutes: number;
  sort: number;
}

export interface ServicePeriodInput {
  name: string;
  startsMinutes: number;
  endsMinutes: number;
  outletId: string | null;
}

export type ServicePeriodVerdict =
  | { ok: true; value: ServicePeriodInput }
  | { ok: false; field: "name" | "times"; reason: string };

export const SERVICE_PERIOD_COPY = {
  refused: "That shift was not saved. You may not have access, or it changed elsewhere. Pull down and try again.",
  noAccess: "Only the owner or someone with Cash & day close can change shifts.",
} as const;

interface PeriodRow {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  name: string;
  starts_minutes: number;
  ends_minutes: number;
  sort: number | null;
}

const COLUMNS = "id, tenant_id, outlet_id, name, starts_minutes, ends_minutes, sort";

function toPeriod(row: PeriodRow): ServicePeriod {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    name: row.name,
    startsMinutes: Number(row.starts_minutes),
    endsMinutes: Number(row.ends_minutes),
    sort: row.sort ?? 0,
  };
}

// ── Words ─────────────────────────────────────────────────────────────────

/** 1215 → "8:15 PM"; 0 → "12:00 AM". */
export function formatClock(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60) % 24;
  const minutes = minutesOfDay % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "8:00 PM – 2:00 AM (next day)" for a shift that runs past midnight. */
export function describePeriodTimes(startsMinutes: number, endsMinutes: number): string {
  const range = `${formatClock(startsMinutes)} – ${formatClock(endsMinutes)}`;
  return endsMinutes <= startsMinutes ? `${range} (next day)` : range;
}

// ── Rules ─────────────────────────────────────────────────────────────────

const isMinuteOfDay = (value: number): boolean => Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;

export function validateServicePeriodInput(
  input: ServicePeriodInput,
  siblings: readonly ServicePeriod[],
  editingId?: string,
): ServicePeriodVerdict {
  const name = input.name.trim();
  if (name.length === 0) return { ok: false, field: "name", reason: "Give the shift a name, like Day shift." };
  if (name.length > SERVICE_PERIOD_NAME_MAX) {
    return { ok: false, field: "name", reason: `Keep the name under ${SERVICE_PERIOD_NAME_MAX} letters.` };
  }
  if (!isMinuteOfDay(input.startsMinutes) || !isMinuteOfDay(input.endsMinutes)) {
    return { ok: false, field: "times", reason: "Pick a start and an end time." };
  }
  if (input.startsMinutes === input.endsMinutes) {
    return { ok: false, field: "times", reason: "A shift can't start and end at the same time." };
  }
  const clash = siblings.some(
    (other) =>
      other.id !== editingId &&
      other.outletId === input.outletId &&
      other.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) return { ok: false, field: "name", reason: "There is already a shift with that name." };
  return { ok: true, value: { ...input, name } };
}

/** The shifts a branch works: its own plus the every-branch ones (null branch = store-wide only). */
export function periodsForBranch(periods: readonly ServicePeriod[], outletId: string | null): ServicePeriod[] {
  return periods.filter((period) => period.outletId === null || period.outletId === outletId);
}

// ── Reads & writes ────────────────────────────────────────────────────────

function readError(error: DbError, fallback: string): Error {
  return describeCashError(error, fallback, SERVICE_PERIOD_COPY.noAccess);
}

async function run(query: PromiseLike<{ data: unknown; error: DbError | null }>) {
  return withDeadline(Promise.resolve(query), REQUEST_MS);
}

/**
 * Live (not archived) shifts, in display order. `outletId` undefined = every
 * shift the caller may read; a uuid = that branch's plus the every-branch ones.
 * THROWS: an empty list means "no named shifts", so a failed read must not
 * look like one.
 */
export async function listServicePeriods(db: CashDb, tenantId: string, outletId?: string): Promise<ServicePeriod[]> {
  if (outletId !== undefined && !UUID.test(outletId)) throw new Error("That branch could not be read.");
  let query = db
    .from("service_periods")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .is("archived_at", null);
  if (outletId !== undefined) query = query.or(`outlet_id.is.null,outlet_id.eq.${outletId}`);
  const { data, error } = await run(
    query.order("sort", { ascending: true }).order("starts_minutes", { ascending: true }).limit(MAX_PERIODS),
  );
  if (error) throw readError(error, "The shifts could not be read.");
  return ((data ?? []) as PeriodRow[]).map(toPeriod);
}

function firstRow(data: unknown): PeriodRow | null {
  return Array.isArray(data) && data.length > 0 ? (data[0] as PeriodRow) : null;
}

function assertValid(input: ServicePeriodInput, siblings: readonly ServicePeriod[], editingId?: string): ServicePeriodInput {
  const verdict = validateServicePeriodInput(input, siblings, editingId);
  if (!verdict.ok) throw new Error(verdict.reason);
  return verdict.value;
}

export async function createServicePeriod(
  db: CashDb,
  tenantId: string,
  input: ServicePeriodInput,
  siblings: readonly ServicePeriod[],
): Promise<ServicePeriod> {
  const value = assertValid(input, siblings);
  const sort = siblings.reduce((max, period) => Math.max(max, period.sort), -1) + 1;
  const { data, error } = await run(
    db
      .from("service_periods")
      .insert({
        tenant_id: tenantId,
        outlet_id: value.outletId,
        name: value.name,
        starts_minutes: value.startsMinutes,
        ends_minutes: value.endsMinutes,
        sort,
      })
      .select(COLUMNS),
  );
  if (error) throw readError(error, "The shift could not be added.");
  const row = firstRow(data);
  if (!row) throw new Error(SERVICE_PERIOD_COPY.refused);
  return toPeriod(row);
}

export async function updateServicePeriod(
  db: CashDb,
  tenantId: string,
  periodId: string,
  input: ServicePeriodInput,
  siblings: readonly ServicePeriod[],
): Promise<ServicePeriod> {
  const value = assertValid(input, siblings, periodId);
  const { data, error } = await run(
    db
      .from("service_periods")
      .update({
        outlet_id: value.outletId,
        name: value.name,
        starts_minutes: value.startsMinutes,
        ends_minutes: value.endsMinutes,
      })
      .eq("tenant_id", tenantId)
      .eq("id", periodId)
      .is("archived_at", null)
      .select(COLUMNS),
  );
  if (error) throw readError(error, "The shift could not be saved.");
  const row = firstRow(data);
  if (!row) throw new Error(SERVICE_PERIOD_COPY.refused);
  return toPeriod(row);
}

/** Archived, never deleted: past shift reports name it. */
export async function archiveServicePeriod(db: CashDb, tenantId: string, periodId: string): Promise<void> {
  const { data, error } = await run(
    db
      .from("service_periods")
      .update({ archived_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", periodId)
      .is("archived_at", null)
      .select("id"),
  );
  if (error) throw readError(error, "The shift could not be removed.");
  if (!firstRow(data)) throw new Error(SERVICE_PERIOD_COPY.refused);
}
