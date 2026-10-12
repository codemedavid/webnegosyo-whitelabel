/**
 * Senior Citizen / PWD discounts at the register — the glue between the cart
 * and the shared engine in `lib/gov-discount/` (a byte-identical copy of the
 * web's, so the register and the server that verifies it price alike).
 *
 * Like the voucher session, this holds INPUTS only: who is claiming, which of
 * the cart is theirs, how many share the table, and any manager approval. The
 * money is re-derived from the cart every time, so voiding the senior's dish
 * takes their discount with it immediately.
 */

import {
  computeGovDiscount,
  govDiscountLines,
  needsManagerApproval,
  saleVatBreakdown,
  type GovAllocation,
  type GovClaimantInput,
  type GovDiscountResult,
  type GovLineInput,
  type GovProblem,
  type StoredGovDiscount,
  type TaxProfile,
} from "./gov-discount";
import type { OrderDiscountLine } from "./order-totals";
import type { PosCartLine } from "./pos-cart";

/** A manager's PIN approval, good for this sale up to `approvedReduction`. */
export interface PosGovApproval {
  approvalId: string;
  approverName: string;
  approvedReduction: number;
}

export interface PosGovSession {
  claimants: readonly GovClaimantInput[];
  /** People at the table, for shared-table claimants. */
  diners: number | null;
  approval: PosGovApproval | null;
  /** A manager was needed but the server could not be reached. */
  approvalSkippedOffline: boolean;
}

export const EMPTY_GOV_SESSION: PosGovSession = {
  claimants: [],
  diners: null,
  approval: null,
  approvalSkippedOffline: false,
};

/** What the register knows about the store that the engine needs. */
export interface PosGovContext {
  /** Null until the store's Tax & discounts settings are loaded or set up. */
  profile: TaxProfile | null;
  /** Menu items the owner excluded (item or category switched off). */
  excludedMenuItemIds: ReadonlySet<string>;
  /** False for take-out and delivery, where only their own serving counts. */
  allowShared: boolean;
  /**
   * The lines the claimants refer to, when that is not the register cart —
   * adding a round to a placed order rings only the new items, but the
   * senior's share is of the whole order.
   */
  pricingCart?: readonly PosCartLine[];
}

/** Order-type kinds where a senior's own serving is all that counts. */
const OWN_SERVING_ONLY_KINDS = new Set([
  "pickup",
  "takeout",
  "take_out",
  "delivery",
]);

export function allowsSharedTable(
  profile: TaxProfile | null,
  orderTypeKind: string | null,
): boolean {
  if (profile && !profile.allowSharedTable) return false;
  return !OWN_SERVING_ONLY_KINDS.has((orderTypeKind ?? "").toLowerCase());
}

export function govLinesFromCart(
  cart: readonly PosCartLine[],
  excluded: ReadonlySet<string>,
): GovLineInput[] {
  return cart.map((line) => ({
    key: line.key,
    name: line.name,
    quantity: line.quantity,
    amount: line.subtotal,
    eligible: !excluded.has(line.menuItemId),
  }));
}

// --- session edits (all return a new session) ------------------------------

export function withClaimant(
  session: PosGovSession,
  claimant: GovClaimantInput,
): PosGovSession {
  const others = session.claimants.filter(
    (existing) => existing.id !== claimant.id,
  );
  return { ...withoutApproval(session), claimants: [...others, claimant] };
}

export function withoutClaimant(
  session: PosGovSession,
  claimantId: string,
): PosGovSession {
  const claimants = session.claimants.filter(
    (claimant) => claimant.id !== claimantId,
  );
  if (claimants.length === 0) return EMPTY_GOV_SESSION;
  return { ...withoutApproval(session), claimants };
}

export function withDiners(
  session: PosGovSession,
  diners: number | null,
): PosGovSession {
  return { ...withoutApproval(session), diners };
}

export function withApproval(
  session: PosGovSession,
  approval: PosGovApproval,
): PosGovSession {
  return { ...session, approval, approvalSkippedOffline: false };
}

export function withOfflineSkip(session: PosGovSession): PosGovSession {
  return { ...session, approval: null, approvalSkippedOffline: true };
}

/** Any change to who claims what voids a previous approval. */
function withoutApproval(session: PosGovSession): PosGovSession {
  return { ...session, approval: null, approvalSkippedOffline: false };
}

/**
 * The claimants after the cart changed: units on lines that are gone are
 * dropped and units are capped at what the line still holds, so a voided item
 * cannot keep a discount alive. Same object back when nothing moved.
 */
export function govSessionAfterCartChange(
  session: PosGovSession,
  cart: readonly PosCartLine[],
): PosGovSession {
  if (cart.length === 0) return EMPTY_GOV_SESSION;
  if (session.claimants.length === 0) return session;

  const quantityByKey = new Map(cart.map((line) => [line.key, line.quantity]));
  let isChanged = false;
  const claimants = session.claimants.map((claimant) => {
    if (claimant.allocation.mode !== "items") return claimant;
    const units: Record<string, number> = {};
    for (const [key, count] of Object.entries(claimant.allocation.units)) {
      const capped = Math.min(count, quantityByKey.get(key) ?? 0);
      if (capped !== count) isChanged = true;
      if (capped > 0) units[key] = capped;
    }
    const allocation: GovAllocation = { mode: "items", units };
    return { ...claimant, allocation };
  });
  return isChanged ? { ...withoutApproval(session), claimants } : session;
}

// --- pricing --------------------------------------------------------------

export interface PosGovPricing {
  /** Successful engine result. */
  result: Extract<GovDiscountResult, { ok: true }>;
  /** The rows the cart and receipt show (sum = result.totalReduction). */
  lines: OrderDiscountLine[];
}

export type PosGovState =
  | { status: "none" }
  | { status: "setup_needed" }
  | { status: "needs_attention"; problems: readonly GovProblem[] }
  | { status: "priced"; pricing: PosGovPricing };

export interface PriceGovSessionInput {
  session: PosGovSession;
  cart: readonly PosCartLine[];
  context: PosGovContext;
  /** The levied service charge in pesos (on the gross subtotal). */
  serviceCharge: number;
  deliveryFee: number;
}

export function priceGovSession(input: PriceGovSessionInput): PosGovState {
  const { session, context } = input;
  const cart = context.pricingCart ?? input.cart;
  if (session.claimants.length === 0) return { status: "none" };
  if (!context.profile) return { status: "setup_needed" };

  const result = computeGovDiscount({
    vatStatus: context.profile.vatStatus,
    lines: govLinesFromCart(cart, context.excludedMenuItemIds),
    claimants: session.claimants,
    diners: session.diners ?? undefined,
    allowShared: context.allowShared,
    enabledKinds: context.profile.enabledKinds,
    serviceCharge: input.serviceCharge,
    serviceChargeMode: context.profile.serviceChargeMode,
    deliveryFee: input.deliveryFee,
  });
  if (!result.ok)
    return { status: "needs_attention", problems: result.problems };

  const lines = govDiscountLines(result.claimants).map((line) => ({
    label: line.label,
    amount: line.amount,
    isGovernment: true,
  }));
  return { status: "priced", pricing: { result, lines } };
}

/** Whether the sale still needs a manager before it can be tendered. */
export function govApprovalPending(
  session: PosGovSession,
  profile: TaxProfile | null,
  totalReduction: number,
): boolean {
  if (!profile || !needsManagerApproval(profile, totalReduction)) return false;
  if (session.approvalSkippedOffline) return false;
  const approval = session.approval;
  return !approval || totalReduction > approval.approvedReduction + 0.01;
}

/**
 * The block stored on the order (`discount.government`) — engine results plus
 * the store rules they were priced under and the VAT breakdown for the receipt.
 */
export function storedGovDiscount(args: {
  session: PosGovSession;
  pricing: PosGovPricing;
  profile: TaxProfile;
  itemsTotal: number;
  serviceCharge: number;
  deliveryFee: number;
}): StoredGovDiscount {
  const { session, pricing, profile } = args;
  return {
    version: 1,
    vatStatus: profile.vatStatus,
    serviceChargeMode: profile.serviceChargeMode,
    diners: session.diners,
    claimants: pricing.result.claimants,
    vat: saleVatBreakdown({
      vatStatus: profile.vatStatus,
      itemsTotal: args.itemsTotal,
      serviceCharge: args.serviceCharge,
      deliveryFee: args.deliveryFee,
      claimants: pricing.result.claimants,
    }),
    approval: session.approval
      ? {
          approvalId: session.approval.approvalId,
          approverName: session.approval.approverName,
        }
      : null,
  };
}

/**
 * Per-line allocations in the order's own convention (`line-<index>`, the
 * index of the line in the order's items), from the engine's per-cart-key
 * reductions.
 */
export function allocationsByOrderLine(
  cart: readonly PosCartLine[],
  lineReductions: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    cart.flatMap((line, index) => {
      const amount = lineReductions[line.key];
      return amount && amount > 0 ? [[`line-${index}`, amount]] : [];
    }),
  );
}

/** Rebuild the session an edited order was placed with. */
export function govSessionFromStored(
  stored: StoredGovDiscount | undefined | null,
): PosGovSession {
  if (!stored || stored.claimants.length === 0) return EMPTY_GOV_SESSION;
  return {
    claimants: stored.claimants.map((claimant) => ({
      id: claimant.id,
      kind: claimant.kind,
      name: claimant.name,
      idNumber: claimant.idNumber,
      allocation: claimant.allocation,
    })),
    diners: stored.diners,
    // A placed sale's approval covered the placed amount; an edit that raises
    // the discount asks again (`govApprovalPending` compares amounts).
    approval: stored.approval
      ? {
          approvalId: stored.approval.approvalId,
          approverName: stored.approval.approverName,
          approvedReduction: stored.claimants.reduce(
            (sum, claimant) => sum + claimant.reduction,
            0,
          ),
        }
      : null,
    approvalSkippedOffline: false,
  };
}
