/**
 * Day close (CONTRACTS W3.1, 07 §5.2–5.3): one frozen record per business day
 * and branch, versioned (a reopen + re-close writes version + 1, the old one
 * is kept). The checklist reads `get_day_close_status`; closing, reopening and
 * the deposit are definer RPCs; the history is a plain RLS read of
 * `business_day_closes` (cash managers with branch reach).
 *
 * The snapshot's sales come from the one sales definition on the server; this
 * module only parses them. A figure the server did not send stays null —
 * never ₱0.
 */

import { withDeadline } from "../offline/deadline";
import { describeCashError, isNotDeployed, type CashDb, type DbError } from "./settings";

const REQUEST_MS = 20_000;
const HISTORY_LIMIT = 90;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// ── Types ─────────────────────────────────────────────────────────────────

export interface SnapshotShift {
  shiftId: string;
  staffName: string;
  drawerName: string | null;
  closeKind: "counted" | "forced";
  floatCents: number | null;
  payOutCents: number | null;
  expectedCents: number | null;
  countedCents: number | null;
  varianceCents: number | null;
  remittance: { status: string; handedOverCents: number | null; receivedCents: number | null } | null;
}

export interface SnapshotSales {
  netCents: number;
  orders: number;
  discountCents: number;
  collectedByMethod: { label: string; cents: number }[];
  unpaidCents: number;
  overpaidCents: number;
}

export interface DayCloseSnapshot {
  windowStart: string | null;
  windowEnd: string | null;
  cutoffMinutes: number | null;
  /** null = this store's sales are not on the platform (drawers only), or the viewer may not see them. */
  sales: SnapshotSales | null;
  shifts: SnapshotShift[];
  totals: {
    expectedCents: number | null;
    countedCents: number | null;
    varianceCents: number | null;
    handedOverCents: number | null;
    receivedCents: number | null;
    collectedMidShiftCents: number | null;
  };
  cashToAccountForCents: number | null;
  expenses: { drawerCents: number | null; otherCents: number | null };
  payOutCents: number | null;
  byServicePeriod: { periodId: string; name: string; netCents: number; orders: number }[];
  otherHoursNetCents: number | null;
  recountChanged: { shiftId: string; staffName: string; firstCents: number; finalCents: number }[];
}

export interface DayCloseStatus {
  businessDay: string;
  windowStart: string | null;
  windowEnd: string | null;
  cutoffMinutes: number;
  openShifts: { shiftId: string; staffName: string; drawerName: string | null; openedAt: string; overdue: boolean }[];
  pendingRemittances: { id: string; cashierName: string; handedOverCents: number | null; status: string }[];
  nonCashUnchecked: { shiftId: string; staffName: string; method: string }[];
  existingClose: { id: string; version: number; status: "closed" | "reopened"; closedAt: string; closedByName: string } | null;
  preview: DayCloseSnapshot | null;
}

export interface DayCloseRecord {
  id: string;
  outletId: string | null;
  businessDay: string;
  version: number;
  status: "closed" | "reopened";
  salesSource: "platform_sql" | "drawers_only" | null;
  snapshot: DayCloseSnapshot | null;
  note: string | null;
  closedByName: string;
  closedAt: string;
  unsettledRemittanceCount: number;
  forcedShiftCount: number;
  deposit: { cents: number; to: string | null; ref: string | null; proofUrl: string | null; recordedAt: string } | null;
  reopen: { byName: string | null; at: string; reason: string | null } | null;
}

export const DAY_CLOSE_COPY = {
  notReady: "Day close needs a server update first. Ask WebNegosyo support.",
  openShifts: "A shift on this day is still open. End it first.",
  unsettled: "This store needs every remittance settled first. Settle them, or close anyway with a note.",
  alreadyClosed: "This day is already closed. Pull down to see it.",
  changed: "It changed elsewhere. Pull down and try again.",
  noAccess: "Only the owner or someone with Cash & day close can close the day.",
  reopenNoAccess: "Only the owner can reopen a closed day.",
  refused: "That was not saved. Pull down and try again.",
  noteRequired: "Add a note saying what you are closing over.",
  reasonRequired: "Say why you are reopening this day.",
  offline: "Closing the day needs a connection.",
} as const;

// ── Parsing ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const obj = (value: unknown): Row => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});
const arr = (value: unknown): Row[] => (Array.isArray(value) ? value.map(obj) : []);
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const field = (row: Row, camel: string, snake: string): unknown => (camel in row ? row[camel] : row[snake]);

function cents(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

function parseSales(raw: unknown): SnapshotSales | null {
  if (raw === null || raw === undefined) return null;
  const s = obj(raw);
  const net = cents(s.netCents);
  if (net === null) return null;
  return {
    netCents: net,
    orders: cents(s.orders) ?? 0,
    discountCents: cents(s.discountCents) ?? 0,
    collectedByMethod: arr(s.collectedByMethod).flatMap((m) => {
      const amount = cents(m.cents);
      const label = str(m.label) ?? str(m.bucket);
      return amount === null || !label ? [] : [{ label, cents: amount }];
    }),
    unpaidCents: cents(s.unpaidCents) ?? 0,
    overpaidCents: cents(s.overpaidCents) ?? 0,
  };
}

function parseShift(s: Row): SnapshotShift | null {
  const shiftId = str(s.shiftId);
  if (!shiftId) return null;
  const remittance = s.remittance ? obj(s.remittance) : null;
  return {
    shiftId,
    staffName: str(s.staff) ?? str(s.staffName) ?? "Staff",
    drawerName: str(s.drawer) ?? str(s.drawerName),
    closeKind: s.closeKind === "forced" ? "forced" : "counted",
    floatCents: cents(s.floatCents),
    payOutCents: cents(s.payOutCents),
    expectedCents: cents(s.expectedCents),
    countedCents: cents(s.countedCents),
    varianceCents: cents(s.varianceCents),
    remittance: remittance
      ? { status: str(remittance.status) ?? "pending", handedOverCents: cents(remittance.handedOverCents), receivedCents: cents(remittance.receivedCents) }
      : null,
  };
}

export function parseSnapshot(raw: unknown): DayCloseSnapshot | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const s = obj(raw);
  const window = obj(s.window);
  const drawers = obj(s.drawers);
  const totals = obj(drawers.totals);
  const expenses = obj(s.expenses);
  const shifts = arr(drawers.shifts).flatMap((row) => {
    const shift = parseShift(row);
    return shift ? [shift] : [];
  });
  // 20261027170000 puts pay-outs on each shift, not in the totals.
  const payOuts = shifts.map((shift) => shift.payOutCents).filter((value): value is number => value !== null);
  return {
    windowStart: str(window.start),
    windowEnd: str(window.end),
    cutoffMinutes: cents(window.cutoffMinutes),
    sales: parseSales(s.sales),
    shifts,
    totals: {
      expectedCents: cents(totals.expectedCents),
      countedCents: cents(totals.countedCents),
      varianceCents: cents(totals.varianceCents),
      handedOverCents: cents(totals.handedOverCents),
      receivedCents: cents(totals.receivedCents),
      collectedMidShiftCents: cents(totals.collectedMidShiftCents),
    },
    cashToAccountForCents: cents(s.cashToAccountForCents),
    expenses: { drawerCents: cents(expenses.drawerCents), otherCents: cents(expenses.otherCents) },
    payOutCents: payOuts.length > 0 ? payOuts.reduce((sum, value) => sum + value, 0) : null,
    byServicePeriod: arr(s.byServicePeriod).flatMap((p) => {
      const periodId = str(p.periodId);
      const net = cents(p.netCents);
      return periodId && net !== null ? [{ periodId, name: str(p.name) ?? "Shift", netCents: net, orders: cents(p.orders) ?? 0 }] : [];
    }),
    otherHoursNetCents: cents(s.otherHoursNetCents),
    recountChanged: arr(s.recountChanged).flatMap((r) => {
      const shiftId = str(r.shiftId);
      const first = cents(r.firstCents);
      const final = cents(r.finalCents);
      return shiftId && first !== null && final !== null ? [{ shiftId, staffName: str(r.staffName) ?? "Staff", firstCents: first, finalCents: final }] : [];
    }),
  };
}

export function parseDayCloseStatus(raw: unknown): DayCloseStatus {
  const s = obj(raw);
  const businessDay = str(s.businessDay);
  if (!businessDay) throw new Error("The day close could not be read.");
  const window = obj(s.window);
  const existing = s.existingClose ? obj(s.existingClose) : null;
  return {
    businessDay,
    windowStart: str(window.start),
    windowEnd: str(window.end),
    cutoffMinutes: cents(s.cutoffMinutes) ?? 0,
    openShifts: arr(s.openShifts).flatMap((o) => {
      const shiftId = str(o.shiftId);
      return shiftId
        ? [{ shiftId, staffName: str(o.staffName) ?? "Staff", drawerName: str(o.drawerName), openedAt: str(o.openedAt) ?? "", overdue: o.overdue === true }]
        : [];
    }),
    pendingRemittances: arr(s.pendingRemittances).flatMap((r) => {
      const id = str(r.id);
      return id ? [{ id, cashierName: str(r.cashierName) ?? "Staff", handedOverCents: cents(r.handedOverCents), status: str(r.status) ?? "pending" }] : [];
    }),
    nonCashUnchecked: arr(s.nonCashUnchecked).flatMap((n) => {
      const shiftId = str(n.shiftId);
      return shiftId ? [{ shiftId, staffName: str(n.staffName) ?? "Staff", method: str(n.method) ?? "Non-cash" }] : [];
    }),
    existingClose:
      existing && str(existing.id)
        ? {
            id: str(existing.id) as string,
            version: cents(existing.version) ?? 1,
            status: existing.status === "reopened" ? "reopened" : "closed",
            closedAt: str(existing.closedAt) ?? "",
            closedByName: str(existing.closedByName) ?? "Staff",
          }
        : null,
    preview: parseSnapshot(s.preview),
  };
}

export function parseDayCloseRecord(raw: unknown): DayCloseRecord {
  const r = obj(raw);
  const id = str(r.id);
  const businessDay = str(field(r, "businessDay", "business_day"));
  if (!id || !businessDay) throw new Error("A day close could not be read.");
  const depositAt = str(field(r, "depositRecordedAt", "deposit_recorded_at"));
  const reopenedAt = str(field(r, "reopenedAt", "reopened_at"));
  const source = field(r, "salesSource", "sales_source");
  const ids = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
  return {
    id,
    outletId: str(field(r, "outletId", "outlet_id")),
    businessDay,
    version: cents(r.version) ?? 1,
    status: r.status === "reopened" ? "reopened" : "closed",
    salesSource: source === "platform_sql" || source === "drawers_only" ? source : null,
    snapshot: parseSnapshot(r.snapshot),
    note: str(r.note),
    closedByName: str(field(r, "closedByName", "closed_by_name")) ?? "Staff",
    closedAt: str(field(r, "closedAt", "closed_at")) ?? "",
    unsettledRemittanceCount: ids(field(r, "unsettledRemittanceIds", "unsettled_remittance_ids")),
    forcedShiftCount: ids(field(r, "forcedShiftIds", "forced_shift_ids")),
    deposit: depositAt
      ? {
          cents: cents(field(r, "depositCents", "deposit_cents")) ?? 0,
          to: str(field(r, "depositTo", "deposit_to")),
          ref: str(field(r, "depositRef", "deposit_ref")),
          proofUrl: str(field(r, "depositProofUrl", "deposit_proof_url")),
          recordedAt: depositAt,
        }
      : null,
    reopen: reopenedAt
      ? { byName: str(field(r, "reopenedByName", "reopened_by_name")), at: reopenedAt, reason: str(field(r, "reopenReason", "reopen_reason")) }
      : null,
  };
}

// ── Errors ────────────────────────────────────────────────────────────────

function closeError(error: DbError, fallback: string, noAccess: string = DAY_CLOSE_COPY.noAccess): Error {
  const message = error.message ?? "";
  if (isNotDeployed(error)) return new Error(DAY_CLOSE_COPY.notReady);
  if (error.code === "55000" && /open_shifts/i.test(message)) return new Error(DAY_CLOSE_COPY.openShifts);
  if (error.code === "55000" && /unsettled_remittances/i.test(message)) return new Error(DAY_CLOSE_COPY.unsettled);
  if (error.code === "23505") return new Error(DAY_CLOSE_COPY.alreadyClosed);
  if (error.code === "P0002") return new Error(DAY_CLOSE_COPY.changed);
  return describeCashError(error, fallback, noAccess);
}

async function call(db: CashDb, fn: string, args: Record<string, unknown>) {
  return withDeadline(Promise.resolve(db.rpc(fn, args)), REQUEST_MS);
}

// ── Reads & writes ────────────────────────────────────────────────────────

export async function getDayCloseStatus(db: CashDb, tenantId: string, outletId: string | null, dayKey: string): Promise<DayCloseStatus> {
  if (!DAY_KEY.test(dayKey)) throw new Error("That day could not be read.");
  const { data, error } = await call(db, "get_day_close_status", { p_tenant: tenantId, p_outlet: outletId, p_day: dayKey });
  if (error) throw closeError(error, "The day close could not be read.");
  return parseDayCloseStatus(data);
}

export interface CloseDayInput {
  tenantId: string;
  outletId: string | null;
  dayKey: string;
  note: string | null;
  /** Close over unsettled remittances in a `required` store; needs a note. */
  force: boolean;
}

export async function closeBusinessDay(db: CashDb, input: CloseDayInput): Promise<{ id: string; version: number }> {
  const note = input.note?.trim() || null;
  if (input.force && !note) throw new Error(DAY_CLOSE_COPY.noteRequired);
  const { data, error } = await call(db, "close_business_day", {
    p_tenant: input.tenantId,
    p_outlet: input.outletId,
    p_day: input.dayKey,
    p_note: note,
    p_force: input.force,
  });
  if (error) throw closeError(error, "The day could not be closed.");
  const row = obj(data);
  const id = str(row.id);
  if (!id) throw new Error(DAY_CLOSE_COPY.refused);
  return { id, version: cents(row.version) ?? 1 };
}

export async function reopenBusinessDay(db: CashDb, closeId: string, reason: string): Promise<void> {
  const clean = reason.trim().slice(0, 300);
  if (!clean) throw new Error(DAY_CLOSE_COPY.reasonRequired);
  const { error } = await call(db, "reopen_business_day", { p_close_id: closeId, p_reason: clean });
  if (error) throw closeError(error, "The day could not be reopened.", DAY_CLOSE_COPY.reopenNoAccess);
}

export interface DepositInput {
  cents: number;
  to: string;
  ref: string | null;
  proofUrl: string | null;
}

/** Set once: a second deposit on the same close is refused by the CAS. */
export async function recordDayDeposit(db: CashDb, closeId: string, deposit: DepositInput): Promise<void> {
  if (!Number.isInteger(deposit.cents) || deposit.cents < 0) throw new Error("Type the amount deposited.");
  const { error } = await call(db, "record_day_deposit", {
    p_close_id: closeId,
    p_cents: deposit.cents,
    p_to: deposit.to.slice(0, 80),
    p_ref: deposit.ref?.slice(0, 80) ?? null,
    p_proof_url: deposit.proofUrl,
  });
  if (error) throw closeError(error, "The deposit could not be recorded.");
}

const RECORD_COLUMNS =
  "id, outlet_id, business_day, version, status, sales_source, snapshot, note, closed_by_name, closed_at, " +
  "unsettled_remittance_ids, forced_shift_ids, deposit_cents, deposit_to, deposit_ref, deposit_proof_url, " +
  "deposit_recorded_at, reopened_by_name, reopened_at, reopen_reason";

/** Closes newest first (live and reopened versions). THROWS: an empty history must not be a guess. */
export async function listDayCloses(db: CashDb, tenantId: string): Promise<DayCloseRecord[]> {
  const { data, error } = await withDeadline(
    Promise.resolve(
      db
        .from("business_day_closes")
        .select(RECORD_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("business_day", { ascending: false })
        .order("version", { ascending: false })
        .limit(HISTORY_LIMIT),
    ),
    REQUEST_MS,
  );
  if (error) throw closeError(error as DbError, "The day closes could not be read.");
  return ((data ?? []) as unknown[]).map(parseDayCloseRecord);
}
