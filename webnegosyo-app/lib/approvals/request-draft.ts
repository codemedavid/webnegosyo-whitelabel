/**
 * The cashier's request sheet (design-spec §3.8) as pure state: what was
 * picked, what it is worth, whether it can be sent, and the exact body the
 * server's createApprovalSchema accepts. The sheet renders; this decides.
 *
 * Amounts here are the app's best estimate (line subtotals); the server's
 * approval_quote is the authority and its figure is what the result shows.
 */
import { formatPesoShort } from "./state";
import { REASONS_BY_KIND, type CreateApprovalInput, type RefundScope } from "./types";

export type RequestSheetKind = "refund" | "cancel_paid";

export interface RequestOrderItem {
  /** order_items.id (uuid). */
  id: string;
  name: string;
  quantity: number;
  /** The line's subtotal in pesos. */
  lineTotal: number;
}

export interface RequestOrder {
  orderId: string;
  /** "#14" */
  orderLabel: string | null;
  /** Pesos that can still be given back (net paid). */
  refundable: number;
  /** "cash", "GCash" */
  paymentLabel: string | null;
  createdAt: string | null;
  outletId: string | null;
  items: readonly RequestOrderItem[];
}

export interface RequestDraft {
  kind: RequestSheetKind;
  scope: RefundScope;
  quantities: Readonly<Record<string, number>>;
  amountText: string;
  reasonCode: string | null;
  note: string;
  restock: boolean;
  /** Once the cashier flips the switch, a new reason no longer resets it. */
  isRestockTouched: boolean;
}

export const NOTE_MAX = 500;
const OTHER = "other";

export function initialDraft(kind: RequestSheetKind, seed: { scope?: RefundScope; amount?: number } = {}): RequestDraft {
  return {
    kind,
    scope: kind === "cancel_paid" ? "whole" : seed.scope ?? "items",
    quantities: {},
    amountText: seed.amount !== undefined && seed.amount > 0 ? String(Math.round(seed.amount * 100) / 100) : "",
    reasonCode: null,
    note: "",
    restock: false,
    isRestockTouched: false,
  };
}

export function withReason(draft: RequestDraft, code: string): RequestDraft {
  const reason = REASONS_BY_KIND[draft.kind].find((option) => option.code === code);
  const restock = draft.isRestockTouched ? draft.restock : reason?.restockByDefault ?? false;
  return { ...draft, reasonCode: code, restock };
}

export function withRestock(draft: RequestDraft, restock: boolean): RequestDraft {
  return { ...draft, restock, isRestockTouched: true };
}

export function withScope(draft: RequestDraft, scope: RefundScope): RequestDraft {
  return draft.kind === "cancel_paid" ? draft : { ...draft, scope };
}

export function withQuantity(draft: RequestDraft, item: RequestOrderItem, quantity: number): RequestDraft {
  const clamped = Math.max(0, Math.min(item.quantity, Math.round(quantity)));
  return { ...draft, quantities: { ...draft.quantities, [item.id]: clamped } };
}

/** Digits and one decimal point, at most two decimals: "1a85.505" → "185.50". */
export function withAmountText(draft: RequestDraft, text: string): RequestDraft {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const amountText = rest.length === 0 ? whole : `${whole}.${rest.join("").slice(0, 2)}`;
  return { ...draft, amountText };
}

export function withNote(draft: RequestDraft, note: string): RequestDraft {
  return { ...draft, note: note.slice(0, NOTE_MAX) };
}

const round2 = (pesos: number): number => Math.round(pesos * 100) / 100;

function parsePesos(text: string): number | null {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? round2(value) : null;
}

function pickedLines(draft: RequestDraft, order: RequestOrder): { item: RequestOrderItem; quantity: number }[] {
  return order.items
    .map((item) => ({ item, quantity: draft.quantities[item.id] ?? 0 }))
    .filter((line) => line.quantity > 0);
}

/** What the draft is worth in pesos (0 when nothing is picked yet). */
export function draftAmount(draft: RequestDraft, order: RequestOrder): number {
  if (draft.kind === "cancel_paid" || draft.scope === "whole") return round2(order.refundable);
  if (draft.scope === "amount") return parsePesos(draft.amountText) ?? 0;
  const total = pickedLines(draft, order).reduce(
    (sum, { item, quantity }) => sum + (item.quantity > 0 ? (item.lineTotal / item.quantity) * quantity : 0),
    0,
  );
  return round2(total);
}

export type DraftCheck =
  | { ok: true; amount: number; input: CreateApprovalInput }
  | { ok: false; hint: string };

function scopeProblem(draft: RequestDraft, order: RequestOrder): string | null {
  if (draft.kind === "cancel_paid" || draft.scope === "whole") return null;
  if (draft.scope === "amount") {
    const amount = parsePesos(draft.amountText);
    if (amount === null) return "Enter the amount to give back";
    if (amount > round2(order.refundable)) return `That's more than was paid. ${formatPesoShort(order.refundable)} can be refunded.`;
    return null;
  }
  const lines = pickedLines(draft, order);
  if (lines.length === 0) return "Pick the items to refund";
  const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  if (lines.reduce((sum, line) => sum + line.quantity, 0) >= pieces) return "That is every item. Choose Whole order instead.";
  return null;
}

function reasonProblem(draft: RequestDraft): string | null {
  if (!draft.reasonCode) return "Pick a reason first";
  if (draft.reasonCode === OTHER && draft.note.trim() === "") return "Add a detail for Other";
  return null;
}

function buildInput(draft: RequestDraft, order: RequestOrder, idempotencyKey: string): CreateApprovalInput {
  const note = draft.note.trim();
  const common = {
    orderId: order.orderId,
    reasonCode: draft.reasonCode ?? "",
    ...(note ? { note } : {}),
    idempotencyKey,
  };
  if (draft.kind === "cancel_paid") return { kind: "cancel_paid", ...common, payload: { restock: draft.restock } };
  if (draft.scope === "amount") {
    return { kind: "refund", ...common, payload: { scope: "amount", amount: parsePesos(draft.amountText) ?? 0 } };
  }
  if (draft.scope === "whole") return { kind: "refund", ...common, payload: { scope: "whole", restock: draft.restock } };
  const lines = pickedLines(draft, order).map(({ item, quantity }) => ({ orderItemId: item.id, quantity }));
  return { kind: "refund", ...common, payload: { scope: "items", lines, restock: draft.restock } };
}

/** Ready to send (with the body), or the one hint that says what is missing. */
export function checkDraft(draft: RequestDraft, order: RequestOrder, idempotencyKey: string): DraftCheck {
  const problem = scopeProblem(draft, order) ?? reasonProblem(draft);
  if (problem) return { ok: false, hint: problem };
  return { ok: true, amount: draftAmount(draft, order), input: buildInput(draft, order, idempotencyKey) };
}

/** The dock button names the outcome (spec P5): never "OK". */
export function submitLabel(kind: RequestSheetKind, amount: number, route: "direct" | "request"): string {
  const money = amount > 0 ? formatPesoShort(amount) : null;
  if (route === "request") return money ? `Send for approval · ${money}` : "Send for approval";
  if (kind === "cancel_paid") return money ? `Cancel and refund ${money} now` : "Cancel and refund now";
  return money ? `Refund ${money} now` : "Refund now";
}

/** "Order #14 · paid ₱480 cash" */
export function sheetSubtitle(order: RequestOrder): string {
  const which = order.orderLabel ? `Order ${order.orderLabel}` : "This order";
  const how = order.paymentLabel ? ` ${order.paymentLabel}` : "";
  return `${which} · paid ${formatPesoShort(order.refundable)}${how}`;
}

/**
 * What the sent body says (everything but the retry key). A retry key must
 * never cover two different bodies (security review M2): after a failed send,
 * an edited draft gets a new key, while a pure retry keeps the old one.
 */
export function draftSignature(draft: RequestDraft, order: RequestOrder): string {
  const lines = pickedLines(draft, order).map(({ item, quantity }) => [item.id, quantity]);
  return JSON.stringify([
    draft.kind,
    order.orderId,
    draft.kind === "cancel_paid" ? "whole" : draft.scope,
    draftAmount(draft, order),
    draft.scope === "items" ? lines : [],
    draft.restock,
    draft.reasonCode,
    draft.note.trim(),
  ]);
}

export interface KeyForSendInput {
  currentKey: string;
  /** The body of the last send that failed, or null when none failed. */
  failedSignature: string | null;
  signature: string;
  mint: () => string;
}

export function keyForSend(input: KeyForSendInput): string {
  if (input.failedSignature === null || input.failedSignature === input.signature) return input.currentKey;
  return input.mint();
}
