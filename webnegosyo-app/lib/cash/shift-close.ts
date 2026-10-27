/**
 * The shift's money RPCs (CONTRACTS W2.2): start, preview, count, close and
 * pickups. The SERVER decides what the drawer should hold, keeps every count
 * attempt (one recount), and reveals the expected figure only AFTER a count —
 * the standard blind-count rule, for blind and open counts alike.
 *
 * Every call runs as the signed-in user behind a deadline and answers a
 * result instead of throwing. Replies are parsed by hand (no zod in the app):
 * a reply without the promised shape is a failure, never a ₱0. When the
 * functions are not on this database yet (`not_deployed`), the Drawer keeps
 * its older direct-write path, so production keeps working until the
 * migrations are applied.
 */

import { withDeadline } from "../offline/deadline";
import { supabase } from "../supabase";
import type { DenominationCounts } from "./denominations";
import type { VarianceReasonKey } from "./reasons";

const CASH_RPC_MS = 15_000;

export interface CashRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

const liveClient: CashRpcClient = { rpc: (fn, args) => supabase.rpc(fn, args) };

/** Refusals the server names in its 22023 message; the screens word each one. */
export type CashRefusal =
  | "recount_limit"
  | "count_required"
  | "variance_reason_required"
  | "not_open"
  | "stale"
  | "other";

export type CashRpcFailure =
  | { ok: false; kind: "not_deployed"; message: string }
  | { ok: false; kind: "forbidden"; message: string }
  | { ok: false; kind: "refused"; refusal: CashRefusal; message: string }
  | { ok: false; kind: "failed"; message: string };

export type CashRpcResult<T> = { ok: true; data: T } | CashRpcFailure;

export const CASH_COPY = {
  failed: "Couldn't reach the store. Check the connection and try again. Your count is saved on this tablet.",
  notDeployed: "This store isn't ready for counted closes yet.",
  forbidden: "This account can't do that for this drawer.",
  recountLimit: "You've already recounted once. Remit with this count; the owner sees both counts.",
  countRequired: "Count the drawer first.",
  reasonRequired: "Pick what happened before you remit.",
  notOpen: "This shift has already ended.",
  stale: "Your last shift is still open from an earlier day. End it before you start a new one.",
} as const;

const REFUSAL_COPY: Record<Exclude<CashRefusal, "other">, string> = {
  recount_limit: CASH_COPY.recountLimit,
  count_required: CASH_COPY.countRequired,
  variance_reason_required: CASH_COPY.reasonRequired,
  not_open: CASH_COPY.notOpen,
  stale: CASH_COPY.stale,
};

function refusalOf(message: string | undefined): CashRefusal {
  const text = message ?? "";
  const known = (Object.keys(REFUSAL_COPY) as Exclude<CashRefusal, "other">[]).find((key) => text.includes(key));
  return known ?? "other";
}

async function callCash<T>(client: CashRpcClient, fn: string, args: Record<string, unknown>, parse: (data: unknown) => T): Promise<CashRpcResult<T>> {
  let answer: { data: unknown; error: { code?: string; message?: string } | null };
  try {
    answer = await withDeadline(Promise.resolve(client.rpc(fn, args)), CASH_RPC_MS);
  } catch {
    return { ok: false, kind: "failed", message: CASH_COPY.failed };
  }
  const { error } = answer;
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { ok: false, kind: "not_deployed", message: CASH_COPY.notDeployed };
    if (error.code === "42501") return { ok: false, kind: "forbidden", message: CASH_COPY.forbidden };
    if (error.code === "22023" || error.code === "P0001" || error.code === "40001") {
      const refusal = refusalOf(error.message);
      return { ok: false, kind: "refused", refusal, message: refusal === "other" ? error.message || CASH_COPY.failed : REFUSAL_COPY[refusal] };
    }
    console.warn(`[cash] ${fn} failed`, error.code, error.message);
    return { ok: false, kind: "failed", message: CASH_COPY.failed };
  }
  try {
    return { ok: true, data: parse(answer.data) };
  } catch (parseError) {
    console.warn(`[cash] ${fn} returned an unexpected shape`, parseError);
    return { ok: false, kind: "failed", message: CASH_COPY.failed };
  }
}

// ── Parsing ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function asRow(value: unknown, what: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${what}: not an object`);
  return value as Row;
}

function cents(row: Row, key: string): number {
  const value = row[key];
  const n = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new Error(`${key}: not whole centavos (${String(value)})`);
  return n;
}

function centsOrNull(row: Row, key: string): number | null {
  return row[key] === null || row[key] === undefined ? null : cents(row, key);
}

function textOrNull(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${key}: not text`);
  return value;
}

function bool(row: Row, key: string): boolean {
  if (typeof row[key] !== "boolean") throw new Error(`${key}: not a boolean`);
  return row[key] as boolean;
}

function oneOf<T extends string>(row: Row, key: string, values: readonly T[]): T {
  const value = row[key];
  if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
  throw new Error(`${key}: unknown (${String(value)})`);
}

export type ExpectedSource = "server" | "device" | "none";
const SOURCES: readonly ExpectedSource[] = ["server", "device", "none"];

export interface NonCashMethod {
  key: string;
  label: string;
  cents: number;
  count: number;
}

export interface ExpectedLine {
  key: string;
  label: string;
  cents: number;
}

export interface ShiftClosePreview {
  source: ExpectedSource;
  /** Blind and not yet counted: expected is withheld. */
  hidden: boolean;
  expectedCents: number | null;
  breakdown: ExpectedLine[] | null;
  nonCashByMethod: NonCashMethod[] | null;
  floatCents: number;
  isZeroBalance: boolean;
  countAttempts: number;
}

function listOrNull<T>(value: unknown, what: string, read: (row: Row) => T): T[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new Error(`${what}: not a list`);
  return value.map((entry) => read(asRow(entry, what)));
}

export function parseClosePreview(data: unknown): ShiftClosePreview {
  const row = asRow(data, "preview");
  return {
    source: oneOf(row, "source", SOURCES),
    hidden: bool(row, "hidden"),
    expectedCents: centsOrNull(row, "expectedCents"),
    // `breakdown` is the server's own line list; anything else is ignored rather than guessed.
    breakdown: Array.isArray(row.breakdown)
      ? listOrNull(row.breakdown, "breakdown", (r) => ({ key: String(r.key ?? ""), label: String(r.label ?? ""), cents: cents(r, "cents") }))
      : null,
    nonCashByMethod: listOrNull(row.nonCashByMethod, "nonCashByMethod", (r) => ({
      key: String(r.key ?? ""),
      label: String(r.label ?? ""),
      cents: cents(r, "cents"),
      count: cents(r, "count"),
    })),
    floatCents: cents(row, "floatCents"),
    isZeroBalance: bool(row, "isZeroBalance"),
    countAttempts: cents(row, "countAttempts"),
  };
}

export interface ShiftCountResult {
  attempt: 1 | 2;
  countedCents: number;
  expectedCents: number | null;
  differenceCents: number | null;
  source: ExpectedSource;
  reasonRequired: boolean;
}

export function parseCountResult(data: unknown): ShiftCountResult {
  const row = asRow(data, "count");
  const attempt = cents(row, "attempt");
  if (attempt !== 1 && attempt !== 2) throw new Error(`attempt: ${attempt}`);
  return {
    attempt,
    countedCents: cents(row, "countedCents"),
    expectedCents: centsOrNull(row, "expectedCents"),
    differenceCents: centsOrNull(row, "differenceCents"),
    source: oneOf(row, "source", SOURCES),
    reasonRequired: bool(row, "reasonRequired"),
  };
}

export interface ShiftCloseResult {
  closedAt: string;
  countedCents: number;
  expectedCents: number | null;
  differenceCents: number | null;
  remittanceId: string | null;
  handedOverCents: number;
}

export function parseCloseResult(data: unknown): ShiftCloseResult {
  const row = asRow(data, "close");
  const closedAt = textOrNull(row, "closedAt");
  if (!closedAt) throw new Error("closedAt: missing");
  return {
    closedAt,
    countedCents: cents(row, "countedCents"),
    expectedCents: centsOrNull(row, "expectedCents"),
    differenceCents: centsOrNull(row, "differenceCents"),
    remittanceId: textOrNull(row, "remittanceId"),
    handedOverCents: cents(row, "handedOverCents"),
  };
}

export interface ShiftHandover {
  previousShiftId: string;
  leftCents: number;
  staffName: string | null;
  closedAt: string | null;
}

export interface OpenShiftResult {
  state: "opened" | "joined" | "stale";
  /** The shift row, camelCase; the Drawer re-reads its own after opening. */
  shiftId: string | null;
  handover: ShiftHandover | null;
}

export function parseOpenResult(data: unknown): OpenShiftResult {
  const row = asRow(data, "open");
  const shift = row.shift && typeof row.shift === "object" ? (row.shift as Row) : null;
  const handover = row.handover ? asRow(row.handover, "handover") : null;
  return {
    state: oneOf(row, "state", ["opened", "joined", "stale"] as const),
    shiftId: shift ? textOrNull(shift, "id") : null,
    handover: handover
      ? {
          previousShiftId: textOrNull(handover, "previousShiftId") ?? "",
          leftCents: cents(handover, "leftCents"),
          staffName: textOrNull(handover, "staffName"),
          closedAt: textOrNull(handover, "closedAt"),
        }
      : null,
  };
}

export interface PickupResult {
  movementId: string;
  remittanceId: string | null;
}

export function parsePickupResult(data: unknown): PickupResult {
  const row = asRow(data, "pickup");
  const movementId = textOrNull(row, "movementId");
  if (!movementId) throw new Error("movementId: missing");
  return { movementId, remittanceId: textOrNull(row, "remittanceId") };
}

// ── Calls ──────────────────────────────────────────────────────────────────

export interface OpenShiftArgs {
  tenantId: string;
  outletId: string | null;
  drawerId: string | null;
  openingFloatCents: number;
  openingDenominations: DenominationCounts | null;
  servicePeriodId: string | null;
  staffName: string;
}

export function openShiftRpc(args: OpenShiftArgs, client: CashRpcClient = liveClient): Promise<CashRpcResult<OpenShiftResult>> {
  return callCash(
    client,
    "open_shift",
    {
      p_tenant: args.tenantId,
      p_outlet: args.outletId,
      p_drawer_id: args.drawerId,
      p_opening_float_cents: args.openingFloatCents,
      p_opening_denominations: args.openingDenominations,
      p_service_period_id: args.servicePeriodId,
      p_staff_name: args.staffName,
    },
    parseOpenResult,
  );
}

export function previewShiftClose(shiftId: string, client: CashRpcClient = liveClient): Promise<CashRpcResult<ShiftClosePreview>> {
  return callCash(client, "preview_shift_close", { p_shift_id: shiftId }, parseClosePreview);
}

export interface CountArgs {
  shiftId: string;
  countedCents: number;
  denominations: DenominationCounts | null;
  /** What this tablet worked out, kept beside the server's figure (shadow phase). */
  deviceExpectedCents: number | null;
}

export function countShift(args: CountArgs, client: CashRpcClient = liveClient): Promise<CashRpcResult<ShiftCountResult>> {
  return callCash(
    client,
    "count_shift",
    {
      p_shift_id: args.shiftId,
      p_counted_cents: args.countedCents,
      p_denominations: args.denominations,
      p_device_expected_cents: args.deviceExpectedCents,
    },
    parseCountResult,
  );
}

/** One non-cash method's check (step 2): matched, different by an amount, or left to the owner. */
export interface NonCashAnswer {
  key: string;
  label: string;
  expectedCents: number;
  status: "matches" | "different" | "unchecked";
  /** What the cashier saw, when different. */
  seenCents: number | null;
  note: string | null;
}

export interface CloseArgs {
  shiftId: string;
  nonCash: readonly NonCashAnswer[];
  varianceReason: VarianceReasonKey | null;
  note: string | null;
  floatKeptCents: number;
  remitTo: string | null;
  remitToSafe: boolean;
  closedByName: string;
}

export function closeShiftRpc(args: CloseArgs, client: CashRpcClient = liveClient): Promise<CashRpcResult<ShiftCloseResult>> {
  return callCash(
    client,
    "close_shift",
    {
      p_shift_id: args.shiftId,
      p_non_cash: args.nonCash.map((a) => ({
        key: a.key,
        label: a.label,
        expectedCents: a.expectedCents,
        status: a.status,
        seenCents: a.seenCents,
        note: a.note,
      })),
      p_variance_reason: args.varianceReason,
      p_note: args.note,
      p_float_kept_cents: args.floatKeptCents,
      p_remit_to: args.remitTo,
      p_remit_to_safe: args.remitToSafe,
      p_closed_by_name: args.closedByName,
    },
    parseCloseResult,
  );
}

export interface PickupArgs {
  shiftId: string;
  amountCents: number;
  takenBy: string | null;
  toSafe: boolean;
  note: string | null;
}

export function recordCashPickup(args: PickupArgs, client: CashRpcClient = liveClient): Promise<CashRpcResult<PickupResult>> {
  return callCash(
    client,
    "record_cash_pickup",
    { p_shift_id: args.shiftId, p_amount_cents: args.amountCents, p_taken_by: args.takenBy, p_to_safe: args.toSafe, p_note: args.note },
    parsePickupResult,
  );
}
