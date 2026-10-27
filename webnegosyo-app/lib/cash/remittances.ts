/**
 * Remittances: cash handed from a cashier to a receiver (CONTRACTS W2.2,
 * 07 §5.1). One row per closed shift (`kind='shift'`) and per pickup taken
 * during one (`kind='pickup'`). pending → accepted | disputed → resolved.
 *
 * Reads are plain RLS reads of `cash_remittances` (the cashier sees their own,
 * the named receiver theirs, cash managers every one they can reach) with the
 * shift embedded for its count. Every transition is a definer RPC with a CAS:
 * a lost race is "someone already handled it", and an empty answer is a
 * refusal, never a success. Money in centavos throughout; the shift's legacy
 * peso columns are converted on the way in.
 */

import { formatPeso } from "../format";
import { withDeadline } from "../offline/deadline";
import { countVerdict, type CountVerdict } from "./reasons";
import { describeCashError, isNotDeployed, type CashDb, type DbError } from "./settings";

const REQUEST_MS = 15_000;
/** One inbox read: open ones of any age plus a fortnight of history is far below this. */
const INBOX_LIMIT = 300;
const MAX_CENTS = 1_000_000_000;
const NOTE_MAX = 300;
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

export const REMITTANCE_KINDS = ["shift", "pickup"] as const;
export const REMITTANCE_STATUSES = ["pending", "accepted", "disputed", "resolved"] as const;
export type RemittanceKind = (typeof REMITTANCE_KINDS)[number];
export type RemittanceStatus = (typeof REMITTANCE_STATUSES)[number];

export interface RemittanceShift {
  drawerName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  /** What the cashier counted; null = not counted (forced close). */
  countedCents: number | null;
  expectedCents: number | null;
  varianceReason: string | null;
}

export interface Remittance {
  id: string;
  tenantId: string;
  outletId: string | null;
  kind: RemittanceKind;
  shiftId: string | null;
  movementId: string | null;
  businessDay: string | null;
  cashierUserId: string | null;
  cashierName: string;
  /** count − float kept; null when nobody counted (forced close). */
  handedOverCents: number | null;
  remittedTo: string | null;
  remittedToName: string | null;
  toSafe: boolean;
  status: RemittanceStatus;
  receivedCents: number | null;
  receivedByName: string | null;
  receivedAt: string | null;
  acceptMethod: "app" | "pin" | null;
  isSelfReceived: boolean;
  receiverNote: string | null;
  disputeReason: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  shift: RemittanceShift | null;
}

export const REMITTANCE_COPY = {
  notReady: "Remittances need a server update first. Ask WebNegosyo support.",
  refused: "That was not saved. You may not have access, or it changed elsewhere. Pull down and try again.",
  notPending: "Someone already handled this one. Pull down to see what happened.",
  noAccess: "Only the owner or someone with Cash & day close can do this, and never for their own cash.",
  noteRequired: "Add a note saying what was different.",
  reasonRequired: "Say what went wrong.",
  resolveNoteRequired: "Add a note saying how it was settled.",
  badAmount: "Type the amount you received.",
  offlineAccept: "Accepting needs a connection.",
  forceCloseRefused: "The shift was not ended. It may have ended already, or you may not have access.",
} as const;

// ── Parsing ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const field = (row: Row, camel: string, snake: string): unknown => (camel in row ? row[camel] : row[snake]);
const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

function cents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}

/** Legacy staff_shifts money is pesos (numeric); centavos from here on. */
function pesosToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`A remittance could not be read (${what}: ${String(value)}).`);
}

function parseShift(raw: unknown): RemittanceShift | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (row === null || row === undefined || typeof row !== "object") return null;
  const s = row as Row;
  return {
    drawerName: text(field(s, "drawerName", "drawer_name")),
    openedAt: text(field(s, "openedAt", "opened_at")),
    closedAt: text(field(s, "closedAt", "closed_at")),
    countedCents: "countedCents" in s ? cents(s.countedCents) : pesosToCents(s.closing_count),
    expectedCents: "expectedCents" in s ? cents(s.expectedCents) : pesosToCents(s.expected_cash),
    varianceReason: text(field(s, "varianceReason", "variance_reason")),
  };
}

export function parseRemittance(raw: unknown): Remittance {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("A remittance could not be read.");
  const row = raw as Row;
  const id = text(row.id);
  if (!id) throw new Error("A remittance could not be read (id).");
  const method = text(field(row, "acceptMethod", "accept_method"));
  return {
    id,
    tenantId: text(field(row, "tenantId", "tenant_id")) ?? "",
    outletId: text(field(row, "outletId", "outlet_id")),
    kind: oneOf(row.kind ?? "shift", REMITTANCE_KINDS, "kind"),
    shiftId: text(field(row, "shiftId", "shift_id")),
    movementId: text(field(row, "movementId", "movement_id")),
    businessDay: text(field(row, "businessDay", "business_day")),
    cashierUserId: text(field(row, "cashierUserId", "cashier_user_id")),
    cashierName: text(field(row, "cashierName", "cashier_name")) ?? "Staff",
    handedOverCents: cents(field(row, "handedOverCents", "handed_over_cents")),
    remittedTo: text(field(row, "remittedTo", "remitted_to")),
    remittedToName: text(field(row, "remittedToName", "remitted_to_name")),
    toSafe: field(row, "toSafe", "to_safe") === true,
    status: oneOf(row.status, REMITTANCE_STATUSES, "status"),
    receivedCents: cents(field(row, "receivedCents", "received_cents")),
    receivedByName: text(field(row, "receivedByName", "received_by_name")),
    receivedAt: text(field(row, "receivedAt", "received_at")),
    acceptMethod: method === "app" || method === "pin" ? method : null,
    isSelfReceived: field(row, "isSelfReceived", "is_self_received") === true,
    receiverNote: text(field(row, "receiverNote", "receiver_note")),
    disputeReason: text(field(row, "disputeReason", "dispute_reason")),
    resolvedByName: text(field(row, "resolvedByName", "resolved_by_name")),
    resolvedAt: text(field(row, "resolvedAt", "resolved_at")),
    // The column is resolved_note (20261027160000); camelCase kept for RPC answers.
    resolutionNote: text(field(row, "resolutionNote", "resolved_note")),
    createdAt: text(field(row, "createdAt", "created_at")) ?? "",
    shift: parseShift(row.shift),
  };
}

// ── What a row says ───────────────────────────────────────────────────────

export interface ShiftResult {
  verdict: CountVerdict | "unknown";
  /** |counted − expected|; null when either is unknown. */
  cents: number | null;
}

/** The cashier's count against expected: the result pill on every row. */
export function shiftResult(remittance: Remittance): ShiftResult {
  const counted = remittance.shift?.countedCents ?? null;
  const expected = remittance.shift?.expectedCents ?? null;
  if (counted === null || expected === null) return { verdict: "unknown", cents: null };
  const difference = counted - expected;
  return { verdict: countVerdict(difference), cents: Math.abs(difference) };
}

/** What the receiver got against the slip (received − handed over); null until received. */
export function receivedDifference(remittance: Remittance): number | null {
  if (remittance.receivedCents === null || remittance.handedOverCents === null) return null;
  return remittance.receivedCents - remittance.handedOverCents;
}

export interface RemittanceViewer {
  userId: string | null;
  isOwner: boolean;
  canManageCash: boolean;
}

export interface RemittanceActions {
  canAccept: boolean;
  canDispute: boolean;
  canResolve: boolean;
}

/**
 * The buttons a viewer gets. The server is the boundary (cash_manage + reach,
 * never the cashier unless owner); this only avoids offering a refusal.
 */
export function actionsFor(remittance: Remittance, viewer: RemittanceViewer): RemittanceActions {
  const mayAct = viewer.canManageCash && (viewer.isOwner || viewer.userId !== remittance.cashierUserId);
  return {
    canAccept: mayAct && remittance.status === "pending",
    canDispute: mayAct && remittance.status === "pending",
    canResolve: mayAct && remittance.status === "disputed",
  };
}

export interface InboxTabs {
  /** Shift remittances waiting for someone: pending, or disputed and waiting to be settled. */
  toAccept: Remittance[];
  accepted: Remittance[];
  pickups: Remittance[];
}

const STATUS_ORDER: Record<RemittanceStatus, number> = { pending: 0, disputed: 1, accepted: 2, resolved: 3 };

export function inboxTabs(list: readonly Remittance[]): InboxTabs {
  const byStatus = (a: Remittance, b: Remittance) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt);
  const shifts = list.filter((r) => r.kind === "shift");
  return {
    toAccept: shifts.filter((r) => r.status === "pending" || r.status === "disputed").sort(byStatus),
    accepted: shifts.filter((r) => r.status === "accepted" || r.status === "resolved").sort(byStatus),
    pickups: list.filter((r) => r.kind === "pickup").sort(byStatus),
  };
}

const wholePesos = (value: number): string => formatPeso(value / 100, 0);

/** The receiver's Home strip: "2 remits to accept · ₱14,725" (pickups count too). */
export function receiverSummary(list: readonly Remittance[]): { count: number; totalCents: number; line: string } | null {
  const pending = list.filter((r) => r.status === "pending");
  if (pending.length === 0) return null;
  const totalCents = pending.reduce((sum, r) => sum + (r.handedOverCents ?? 0), 0);
  const noun = pending.length === 1 ? "remit" : "remits";
  return { count: pending.length, totalCents, line: `${pending.length} ${noun} to accept · ${wholePesos(totalCents)}` };
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** The cashier's Home strip after remitting: "Remitted ₱6,345 · waiting for Maria". */
export function cashierWaiting(list: readonly Remittance[], userId: string | null): string | null {
  const mine = list
    .filter((r) => r.kind === "shift" && r.status === "pending" && r.cashierUserId === userId && userId !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!mine) return null;
  const amount = mine.handedOverCents === null ? "your cash" : wholePesos(mine.handedOverCents);
  if (mine.remittedToName) return `Remitted ${amount} · waiting for ${firstName(mine.remittedToName)}`;
  if (mine.toSafe) return `Remitted ${amount} · in the safe, waiting to be counted`;
  return `Remitted ${amount} · waiting to be accepted`;
}

// ── Validation ────────────────────────────────────────────────────────────

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

const isAmount = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= MAX_CENTS;

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, NOTE_MAX) : null;
}

/** A different amount than the slip needs a note (07 §5.1 discrepancy rule). */
export function validateAccept(
  handedOverCents: number | null,
  receivedCents: number,
  note: string | null | undefined,
): Verdict<{ receivedCents: number; note: string | null }> {
  if (!isAmount(receivedCents)) return { ok: false, reason: REMITTANCE_COPY.badAmount };
  const clean = cleanNote(note);
  if (handedOverCents !== null && receivedCents !== handedOverCents && clean === null) {
    return { ok: false, reason: REMITTANCE_COPY.noteRequired };
  }
  return { ok: true, value: { receivedCents, note: clean } };
}

export function validateDispute(
  reason: string,
  receivedCents: number | null,
): Verdict<{ reason: string; receivedCents: number | null }> {
  const clean = cleanNote(reason);
  if (clean === null) return { ok: false, reason: REMITTANCE_COPY.reasonRequired };
  if (receivedCents !== null && !isAmount(receivedCents)) return { ok: false, reason: REMITTANCE_COPY.badAmount };
  return { ok: true, value: { reason: clean, receivedCents } };
}

export function validateResolve(note: string): Verdict<string> {
  const clean = cleanNote(note);
  return clean === null ? { ok: false, reason: REMITTANCE_COPY.resolveNoteRequired } : { ok: true, value: clean };
}

// ── Reads & writes ────────────────────────────────────────────────────────

const COLUMNS = [
  "id, tenant_id, outlet_id, kind, shift_id, movement_id, business_day, cashier_user_id, cashier_name",
  "handed_over_cents, remitted_to, remitted_to_name, to_safe, status, received_cents, received_by_name, received_at",
  "accept_method, is_self_received, receiver_note, dispute_reason, resolved_by_name, resolved_at, resolved_note, created_at",
  // Named FK: the embed must not become ambiguous if another link to staff_shifts appears.
  "shift:staff_shifts!cash_remittances_shift_id_fkey(drawer_name, opened_at, closed_at, closing_count, expected_cash, variance_reason)",
].join(", ");

function readError(error: DbError, fallback: string): Error {
  if (isNotDeployed(error)) return new Error(REMITTANCE_COPY.notReady);
  if (error.code === "P0002" || /not_pending/i.test(error.message ?? "")) return new Error(REMITTANCE_COPY.notPending);
  if (/note/i.test(error.message ?? "") && (error.code === "22023" || error.code === "23514")) {
    return new Error(REMITTANCE_COPY.noteRequired);
  }
  return describeCashError(error, fallback, REMITTANCE_COPY.noAccess);
}

export interface RemittanceQuery {
  /** Open ones of any age, plus everything created since this instant. */
  sinceIso: string;
  /** Only this cashier's (their own Home strip). */
  cashierUserId?: string;
}

/** THROWS on a failed read: an empty inbox must never be a guess. */
export async function listRemittances(db: CashDb, tenantId: string, query: RemittanceQuery): Promise<Remittance[]> {
  if (!ISO.test(query.sinceIso)) throw new Error("The remittances could not be read (bad date).");
  let builder = db
    .from("cash_remittances")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .or(`status.in.(pending,disputed),created_at.gte.${query.sinceIso}`);
  if (query.cashierUserId) builder = builder.eq("cashier_user_id", query.cashierUserId);
  const { data, error } = await withDeadline(
    Promise.resolve(builder.order("created_at", { ascending: false }).limit(INBOX_LIMIT)),
    REQUEST_MS,
  );
  if (error) throw readError(error as DbError, "The remittances could not be read.");
  return ((data ?? []) as unknown[]).map(parseRemittance);
}

async function transition(db: CashDb, fn: string, args: Record<string, unknown>, fallback: string): Promise<Remittance> {
  const { data, error } = await withDeadline(Promise.resolve(db.rpc(fn, args)), REQUEST_MS);
  if (error) throw readError(error, fallback);
  if (data === null || data === undefined) throw new Error(REMITTANCE_COPY.refused);
  return parseRemittance(Array.isArray(data) ? data[0] : data);
}

export async function acceptRemittance(
  db: CashDb,
  remittance: Remittance,
  receivedCents: number,
  note: string | null,
): Promise<Remittance> {
  const verdict = validateAccept(remittance.handedOverCents, receivedCents, note);
  if (!verdict.ok) throw new Error(verdict.reason);
  return transition(
    db,
    "accept_remittance",
    { p_id: remittance.id, p_received_cents: verdict.value.receivedCents, p_note: verdict.value.note },
    "The remittance could not be accepted.",
  );
}

export async function disputeRemittance(
  db: CashDb,
  remittance: Remittance,
  reason: string,
  receivedCents: number | null,
): Promise<Remittance> {
  const verdict = validateDispute(reason, receivedCents);
  if (!verdict.ok) throw new Error(verdict.reason);
  return transition(
    db,
    "dispute_remittance",
    { p_id: remittance.id, p_reason: verdict.value.reason, p_received_cents: verdict.value.receivedCents },
    "The problem could not be reported.",
  );
}

export async function resolveRemittance(db: CashDb, remittance: Remittance, note: string): Promise<Remittance> {
  const verdict = validateResolve(note);
  if (!verdict.ok) throw new Error(verdict.reason);
  return transition(db, "resolve_remittance", { p_id: remittance.id, p_note: verdict.value }, "It could not be settled.");
}

export interface ForceCloseResult {
  closedAt: string;
  remittanceId: string | null;
}

/**
 * "End for him": a cash manager closes someone else's shift. No count is
 * invented — whoever receives the cash counts it on the remittance.
 */
export async function forceCloseShift(db: CashDb, shiftId: string, note: string): Promise<ForceCloseResult> {
  const { data, error } = await withDeadline(
    Promise.resolve(db.rpc("force_close_shift", { p_shift_id: shiftId, p_note: cleanNote(note) ?? "" })),
    REQUEST_MS,
  );
  if (error) throw readError(error, "The shift could not be ended.");
  const row = (data ?? null) as Row | null;
  const closedAt = row ? text(field(row, "closedAt", "closed_at")) : null;
  if (!closedAt) throw new Error(REMITTANCE_COPY.forceCloseRefused);
  return { closedAt, remittanceId: text(field(row as Row, "remittanceId", "remittance_id")) };
}

// ── Forgotten shifts (Home strip) ─────────────────────────────────────────

export interface OpenShiftLike {
  id: string;
  staffName: string;
  staffUserId: string | null;
  drawerName: string | null;
  openedAt: string;
}

export interface OverdueShift<T extends OpenShiftLike> {
  shift: T;
  hoursOpen: number;
  line: string;
}

const HOUR = 60 * 60 * 1000;

/**
 * Open shifts past their business day's end plus the store's grace (06 §2:
 * "cutoff + 4 h"), oldest first, with the receiver's line: "Ben's shift on
 * Cashier 2 is still open (11h)". `dayEndMsOf` is the end of the business day
 * an instant belongs to (bizday's tradingDayWindow), so no day maths here.
 */
export function overdueShifts<T extends OpenShiftLike>(
  shifts: readonly T[],
  dayEndMsOf: (iso: string) => number,
  graceMinutes: number,
  nowMs: number,
  viewerUserId: string | null,
): OverdueShift<T>[] {
  return shifts
    .filter((shift) => shift.staffUserId !== viewerUserId || viewerUserId === null)
    .filter((shift) => nowMs > dayEndMsOf(shift.openedAt) + graceMinutes * 60_000)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
    .map((shift) => {
      const hoursOpen = Math.max(1, Math.floor((nowMs - Date.parse(shift.openedAt)) / HOUR));
      const where = shift.drawerName ? ` on ${shift.drawerName}` : "";
      return { shift, hoursOpen, line: `${firstName(shift.staffName)}'s shift${where} is still open (${hoursOpen}h)` };
    });
}
