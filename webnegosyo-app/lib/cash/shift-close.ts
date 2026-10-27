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
import type { CloseNonCashRow } from "../../components/cash/non-cash";
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
  | "denominations_required"
  | "expected_unavailable"
  | "remit_to_invalid"
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
  denominationsRequired: "This store counts bills and coins at the end of a shift. Switch to Count bills.",
  remitToInvalid: "That person can't receive cash at this branch. Pick someone else, or the store safe.",
  expectedUnavailable: "The Drawer's figure for this shift is missing. Go back to the Drawer, let it add up, then count again.",
  stale: "Your last shift is still open from an earlier day. End it before you start a new one.",
} as const;

const REFUSAL_COPY: Record<Exclude<CashRefusal, "other">, string> = {
  recount_limit: CASH_COPY.recountLimit,
  count_required: CASH_COPY.countRequired,
  variance_reason_required: CASH_COPY.reasonRequired,
  denominations_required: CASH_COPY.denominationsRequired,
  expected_unavailable: CASH_COPY.expectedUnavailable,
  remit_to_invalid: CASH_COPY.remitToInvalid,
  not_open: CASH_COPY.notOpen,
  stale: CASH_COPY.stale,
};

/** "taken_by_required: say who took the cash…" → "Say who took the cash…": the server's words without its key. */
export function serverWords(message: string | undefined): string | null {
  const text = (message ?? "").replace(/^[a-z_]+:\s*/, "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

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
    // 55000 = already closed; P0002 = not found or shift_not_open (the server's own words either way).
    if (["22023", "P0001", "P0002", "40001", "55000"].includes(error.code ?? "")) {
      const refusal = refusalOf(error.message);
      return { ok: false, kind: "refused", refusal, message: refusal === "other" ? serverWords(error.message) ?? CASH_COPY.failed : REFUSAL_COPY[refusal] };
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

export * from "./shift-close-parse";
import {
  parseClosePreview,
  parseCloseResult,
  parseCountResult,
  parseOpenResult,
  parsePickupResult,
  type OpenShiftResult,
  type PickupResult,
  type ShiftClosePreview,
  type ShiftCloseResult,
  type ShiftCountResult,
} from "./shift-close-parse";

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

export interface CloseArgs {
  shiftId: string;
  /** From `toCloseNonCash(answers)` (components/cash/non-cash.ts). */
  nonCash: readonly CloseNonCashRow[];
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
      p_non_cash: args.nonCash,
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
