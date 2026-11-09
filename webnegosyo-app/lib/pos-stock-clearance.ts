/**
 * The server's stock check for one register sale on a `block` store
 * (`POST /api/pos/stock-clearance`, plan docs/plans/2026-11-10-pos-block-server.md).
 *
 * On a block store the platform database refuses a sale this register writes
 * unless the server cleared it first for the order id minted here — or the
 * sale says it was taken offline (`pos.stockCheck = 'offline'`), which keeps
 * it and flags it for the owner if it sold past the shelf. So at Charge, while
 * the customer is still at the counter:
 *
 *   online  → ask; a short sale needs a manager's PIN (`StockApprovalSheet`)
 *   offline → or the server could not be reached → mark it offline and sell.
 *
 * The till never waits longer than the call's deadline. A store known to be on
 * `warn` (from the ceilings read or an earlier answer) is never asked.
 */

import { callWebRoute, messageOf, type ApproverChoice } from "./gov-ledger/approval-client";
import type { PosStockItem } from "./pos-stock";
import type { PosStockPolicy } from "./pos-stock-decision";
import { knownStockPolicy as knownStockPolicyFor, rememberStockPolicy } from "./pos-stock-policy-memo";

export const STOCK_CLEARANCE_ROUTE = "/api/pos/stock-clearance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK = "The stock check could not be confirmed. Try again.";

// ---------------------------------------------------------------------------
// Which stores ask
// ---------------------------------------------------------------------------

export { forgetStockPolicies, knownStockPolicy, rememberStockPolicy } from "./pos-stock-policy-memo";

export type ClearanceStep = "ask" | "offline" | "skip";

/**
 * `ask` the server, mark the sale `offline`, or `skip` (Convex, or a store
 * known to warn). An unknown policy asks: a block store whose stock read
 * failed must not write a sale the database will refuse.
 */
export function shouldAskForClearance(input: {
  isPlatform: boolean;
  policy: PosStockPolicy | undefined;
  isOffline: boolean;
}): ClearanceStep {
  if (!input.isPlatform || input.policy === "warn") return "skip";
  return input.isOffline ? "offline" : "ask";
}

// ---------------------------------------------------------------------------
// What is sent
// ---------------------------------------------------------------------------

export interface ClearanceLine {
  menuItemId: string;
  quantity: number;
  optionIds?: string[];
  addonIds?: string[];
  addonQuantities?: Record<string, number>;
}

/**
 * The sale's stock items as the route takes them. A non-uuid dish id is stored
 * as no dish (`toUuidOrNull`), which the database never limits, so it is not
 * sent; neither is a quantity the order could not hold.
 */
export function clearanceLines(items: readonly PosStockItem[]): ClearanceLine[] {
  return items
    .filter((item) => UUID.test(item.menuItemId) && Number.isInteger(item.quantity) && item.quantity > 0)
    .map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      optionIds: [...item.optionIds],
      ...(item.addonIds ? { addonIds: [...item.addonIds] } : {}),
      ...(item.addonQuantities ? { addonQuantities: { ...item.addonQuantities } } : {}),
    }));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The sale's `customerData` marked as taken offline (a new object). */
export function withOfflineStockCheck(customerData: Record<string, unknown> | undefined): Record<string, unknown> {
  const data = customerData ?? {};
  const pos = isRecord(data.pos) ? data.pos : {};
  return { ...data, pos: { ...pos, stockCheck: "offline" } };
}

/** A customer-authored payload (QR hand-off) never decides that a sale was offline. */
export function withoutCustomerStockCheck(customerData: Record<string, unknown> | undefined): Record<string, unknown> {
  const data = customerData ?? {};
  if (!isRecord(data.pos) || !("stockCheck" in data.pos)) return { ...data };
  const pos = Object.fromEntries(Object.entries(data.pos).filter(([key]) => key !== "stockCheck"));
  return { ...data, pos };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface ClearanceShortfall {
  menuItemId: string;
  name: string;
  requested: number;
  producible: number;
}

export type ClearanceAnswer =
  | { kind: "go"; policy: PosStockPolicy; approverName?: string; outletId?: string | null }
  | { kind: "needs_manager"; message: string; shortfalls: ClearanceShortfall[]; approvers: ApproverChoice[] }
  | { kind: "refused"; message: string }
  | { kind: "unreachable" };

function isShortfall(value: unknown): value is ClearanceShortfall {
  return (
    isRecord(value) &&
    typeof value.menuItemId === "string" &&
    typeof value.name === "string" &&
    typeof value.requested === "number" &&
    typeof value.producible === "number"
  );
}

function isApprover(value: unknown): value is ApproverChoice {
  return isRecord(value) && typeof value.userId === "string" && typeof value.name === "string" && typeof value.hasPin === "boolean";
}

/** Statuses that mean "could not ask", never "refused": sell, marked offline. */
const UNREACHABLE = (status: number) => status >= 500 || status === 401 || status === 404 || status === 408;

export function readClearanceAnswer(
  response: { ok: boolean; status: number; json: Record<string, unknown> } | null,
): ClearanceAnswer {
  if (!response || UNREACHABLE(response.status)) return { kind: "unreachable" };
  const { json } = response;
  if (response.ok) {
    if (json.status === "not_required") return { kind: "go", policy: "warn" };
    const bound =
      json.outletId === null || typeof json.outletId === "string" ? { outletId: json.outletId as string | null } : {};
    if (json.status === "cleared" && typeof json.clearanceId === "string") return { kind: "go", policy: "block", ...bound };
    if (json.status === "approved" && typeof json.clearanceId === "string") {
      return {
        kind: "go",
        policy: "block",
        ...(typeof json.approverName === "string" ? { approverName: json.approverName } : {}),
        ...bound,
      };
    }
    return { kind: "refused", message: FALLBACK };
  }
  if (response.status === 409 && json.status === "needs_manager") {
    return {
      kind: "needs_manager",
      message: messageOf(json, "Stock does not cover this sale. A manager has to approve it."),
      shortfalls: Array.isArray(json.shortfalls) ? json.shortfalls.filter(isShortfall) : [],
      approvers: Array.isArray(json.approvers) ? json.approvers.filter(isApprover) : [],
    };
  }
  return { kind: "refused", message: messageOf(json, FALLBACK) };
}

export interface ClearanceAsk {
  tenantId: string;
  orderId: string;
  outletId: string | null;
  lines: ClearanceLine[];
  approval?: { approverUserId: string; pin: string };
}

/** Ask once, bounded. Never throws. */
export async function requestStockClearance(ask: ClearanceAsk): Promise<ClearanceAnswer> {
  const answer = readClearanceAnswer(await callWebRoute(STOCK_CLEARANCE_ROUTE, { method: "POST", body: ask }));
  if (answer.kind === "go") rememberStockPolicy(ask.tenantId, answer.policy);
  if (answer.kind === "needs_manager") rememberStockPolicy(ask.tenantId, "block");
  return answer;
}

// ---------------------------------------------------------------------------
// The tender's step
// ---------------------------------------------------------------------------

export type SaleStockGate =
  /** Write the sale; `offline` = stamp `pos.stockCheck = 'offline'` on it. */
  | { kind: "proceed"; offline: boolean; approverName?: string }
  | { kind: "needs_manager"; message: string; shortfalls: ClearanceShortfall[]; approvers: ApproverChoice[] }
  | { kind: "refused"; message: string };

export interface SaleStockGateInput {
  tenantId: string;
  orderId: string;
  outletId: string | null;
  isPlatform: boolean;
  lines: ClearanceLine[];
  /** A manager already approved this exact sale (same id, same lines). */
  isApproved: boolean;
  isOffline: () => boolean;
  request?: (ask: ClearanceAsk) => Promise<ClearanceAnswer>;
}

/**
 * What the tender does before it hands the sale over. Never throws; an
 * unreachable server keeps the sale and marks it offline, exactly as a sale
 * taken with the network down.
 */
export async function gateSaleStock(input: SaleStockGateInput): Promise<SaleStockGate> {
  if (input.isApproved) return { kind: "proceed", offline: false };
  const step = shouldAskForClearance({
    isPlatform: input.isPlatform,
    policy: knownStockPolicyFor(input.tenantId),
    isOffline: input.isOffline(),
  });
  if (step === "skip") return { kind: "proceed", offline: false };
  if (step === "offline") return { kind: "proceed", offline: true };

  const request = input.request ?? requestStockClearance;
  const answer = await request({
    tenantId: input.tenantId,
    orderId: input.orderId,
    outletId: input.outletId,
    lines: input.lines,
  });
  switch (answer.kind) {
    case "go":
      // Cleared for another branch than the row will carry (a branch account
      // whose sale names none): the database would refuse it after hand-over,
      // so keep it the offline way — accepted, and flagged if it oversold.
      if (answer.outletId !== undefined && answer.outletId !== input.outletId) return { kind: "proceed", offline: true };
      return { kind: "proceed", offline: false, ...(answer.approverName ? { approverName: answer.approverName } : {}) };
    case "unreachable":
      return { kind: "proceed", offline: true };
    case "needs_manager":
      return { kind: "needs_manager", message: answer.message, shortfalls: answer.shortfalls, approvers: answer.approvers };
    default:
      return { kind: "refused", message: answer.message };
  }
}

/** One sale's identity for "already approved": its id and exactly what it holds. */
export function saleStockKey(orderId: string, outletId: string | null, lines: readonly ClearanceLine[]): string {
  return JSON.stringify([orderId, outletId, lines]);
}
