/**
 * Why an order was cancelled — the reason chips (design spec §4), their
 * validation, and how the reason travels.
 *
 * It rides on the status mutation's own args (`reason`, `note`) so every
 * screen that cancels goes through the one chokepoint (`useSafeMutation`):
 * - platform stores: the adapter writes it to `orders.cancel_reason`, which
 *   the store_activity trigger records as the cancel's reason;
 * - every store: the lifecycle post carries it to the platform, which logs it
 *   on `order_status_events` (Convex / tenant-Supabase stores' only record);
 * - Convex's `orders:updateOrderStatus` validates its args strictly, so the
 *   two keys are stripped before a Convex call (`stripOrderEventReason`).
 */

/** The cancel-a-paid-order list from the copy deck; it reads right for any cancel. */
export const CANCEL_REASONS = [
  "Customer left",
  "Customer changed mind",
  "Ordered twice by mistake",
  "Wrong order entered",
  "Item ran out",
  "Store closing",
  "Other",
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

/** orders_cancel_reason_len_ck */
export const CANCEL_REASON_MAX = 500;
/** order_status_events note limit (ORDER_EVENT_NOTE_MAX on the web). */
export const CANCEL_NOTE_MAX = 1000;

const OTHER: CancelReason = "Other";

export interface OrderEventReason {
  reason: string | null;
  note: string | null;
}

export interface CancelReasonDraft {
  reason: string | null;
  note: string;
}

export type CancelReasonCheck =
  | { ok: true; value: { reason: CancelReason; note: string | null } }
  | { ok: false; hint: string };

function isCancelReason(value: string | null): value is CancelReason {
  return value !== null && (CANCEL_REASONS as readonly string[]).includes(value);
}

export function validateCancelReason(draft: CancelReasonDraft): CancelReasonCheck {
  if (!isCancelReason(draft.reason)) return { ok: false, hint: "Pick a reason first" };
  const note = draft.note.trim().slice(0, CANCEL_NOTE_MAX);
  if (draft.reason === OTHER && note === "") return { ok: false, hint: "Add a detail for Other" };
  return { ok: true, value: { reason: draft.reason, note: note === "" ? null : note } };
}

/** What `orders.cancel_reason` holds: one column, so the note joins the chip. */
export function cancelReasonColumn(why: { reason: string; note: string | null }): string {
  const text = why.note ? `${why.reason}: ${why.note}` : why.reason;
  return text.slice(0, CANCEL_REASON_MAX);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function withOrderEventReason<T extends Record<string, unknown>>(args: T, why: OrderEventReason): T & Partial<OrderEventReason> {
  return {
    ...args,
    ...(why.reason ? { reason: why.reason } : {}),
    ...(why.note ? { note: why.note } : {}),
  };
}

export function readOrderEventReason(args: unknown): OrderEventReason {
  if (!isRecord(args)) return { reason: null, note: null };
  return { reason: textOrNull(args.reason), note: textOrNull(args.note) };
}

/** The args without the reason keys; anything that is not an object passes through. */
export function stripOrderEventReason(args: unknown): unknown {
  if (!isRecord(args) || (!("reason" in args) && !("note" in args))) return args;
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== "reason" && key !== "note"));
}
