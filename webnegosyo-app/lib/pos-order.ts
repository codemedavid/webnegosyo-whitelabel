/**
 * Translates a finished register sale into the `orders:createOrder` argument
 * shape, and reads that payload back off an order.
 *
 * Why the payment details ride inside `customerData`: the Convex `orders` table
 * has no columns for cash tendered, change due, or a payment-proof image, and
 * `customerData` is already a free-form `v.any()` blob (advance-orders uses it
 * the same way). Writing there means every tenant's ALREADY-DEPLOYED Convex
 * backend accepts POS sales today, with no schema bump and no per-tenant
 * redeploy. {@link PosPaymentPayload} is the typed contract both sides share;
 * {@link readPosPayment} is the only sanctioned way to read it back.
 *
 * Pure and side-effect free — no network, no clock, no id generation. The
 * caller supplies `clientOrderId` so the idempotency key survives a retry.
 */

import { cartTotals, type PosCartLine, type ServiceCharge } from "./pos-cart";
import type { OrderDiscountLine } from "./order-totals";
import { computeChange } from "./pos-cash";
import { withOrderOutlet, type OrderOutletContext } from "./order-outlet";
import { tableCustomerData, type PosTableDetails } from "./pos-table";
import {
  chargeableDeliveryFee,
  deliveryCustomerData,
  type PosDeliveryDetails,
} from "./pos-delivery";

/** Shown on the order card when the cashier did not take a name. */
export const POS_WALK_IN_NAME = "Walk-in";

/** How the counter sale was settled. */
export interface PosTender {
  methodName: string;
  isCash: boolean;
  methodDetails?: string;
  /** Cash sales only. */
  cashTendered?: number;
  /** Cash sales only. */
  changeDue?: number;
  /** Non-cash sales: the captured confirmation screenshot. */
  proofUrl?: string;
  proofFileId?: string;
  /** Non-cash sales: transaction reference, if the cashier typed one. */
  reference?: string;
}

/** The typed blob written to (and read from) `customerData.pos`. */
export interface PosPaymentPayload {
  cashTendered?: number;
  changeDue?: number;
  proofUrl?: string;
  proofFileId?: string;
  reference?: string;
  cashierId?: string;
}

export interface PosOrderContext {
  cart: PosCartLine[];
  tender: PosTender;
  clientOrderId: string;
  orderType?: string;
  orderTypeId?: string;
  serviceCharge?: ServiceCharge;
  customerName?: string;
  customerContact?: string;
  cashierId?: string;
  /**
   * The branch this register belongs to — the signed-in account's branch.
   * Null/absent for a single-location store, which stamps nothing.
   */
  outlet?: OrderOutletContext | null;
  /**
   * Manual delivery details the cashier attached — fee, address, phone, all
   * optional. Absent on an ordinary counter sale.
   */
  delivery?: PosDeliveryDetails | null;
  /** The table a dine-in sale is for. Absent on a counter or delivery sale. */
  table?: PosTableDetails | null;
  /** Any non-POS customerData the caller already assembled. */
  customerData?: Record<string, unknown>;
  /**
   * Vouchers and manual discounts already resolved by `pos-discount.ts`.
   *
   * Lines rather than codes, because the register prices locally — it has to
   * work on a flaky connection at a counter. The redemption is still burned
   * server-side, where the conditional UPDATE in `redeem_voucher()` is the real
   * protection against over-redemption.
   */
  discounts?: readonly OrderDiscountLine[];
}

interface PosOrderItem {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  specialInstructions?: string;
  variationSelections?: {
    typeName: string;
    optionName: string;
    priceAdjustment: number;
  }[];
}

export interface PosOrderArgs {
  customerName: string;
  customerContact: string;
  customerData: Record<string, unknown> & { pos: PosPaymentPayload };
  total: number;
  /**
   * Only present when a fee was charged, so a sale without one sends the exact
   * argument shape every already-deployed backend has always accepted.
   */
  deliveryFee?: number;
  /**
   * Also present only when taken. Convex and the platform DB both have a real
   * column for it; the blob copy (`customerData.delivery_address`) covers
   * everything else.
   */
  deliveryAddress?: string;
  /**
   * What the order type levied for service, already inside {@link total}.
   *
   * Present only when actually charged, on the same rule as `deliveryFee` — a
   * sale with no charge sends no key, so no reader draws a zero row.
   *
   * Sent so the figure can be NAMED downstream. It was always spent and never
   * recorded, which left the order screen and the receipt showing items that
   * did not sum to the bill with nothing to caption the difference.
   */
  serviceCharge?: number;
  orderType?: string;
  orderTypeId?: string;
  source: "pos";
  clientOrderId: string;
  itemCount: number;
  paymentMethod: string;
  paymentMethodDetails?: string;
  items: PosOrderItem[];
}

/**
 * The discount breakdown as it is stored, or nothing at all.
 *
 * Returns an empty object rather than `{ discount: null }` so an ordinary sale
 * carries no discount key — the overwhelming majority of them.
 *
 * `discountTotal` is the amount ACTUALLY taken off, already capped by
 * `cartTotals`, not the sum requested. A voucher worth more than the sale makes
 * it free, never a payout, and the stored breakdown must say what really
 * happened rather than what was asked for.
 */
function discountBlob(
  discounts: readonly OrderDiscountLine[] | undefined,
  discountTotal: number,
): Record<string, unknown> {
  if (!discounts || discounts.length === 0 || discountTotal <= 0) return {};

  return {
    discount: {
      total: discountTotal,
      // Always zero at a counter: a walk-in sale has no delivery to discount.
      deliveryDiscount: 0,
      lines: discounts.filter((line) => Number.isFinite(line.amount) && line.amount > 0),
      // Per-line allocation is a checkout concern (partial refunds of a
      // delivered order). A counter sale is refunded whole.
      allocationsByLine: {},
    },
  };
}

/** Drop undefined keys so the blob stays readable in the Convex dashboard. */
function compact(payload: PosPaymentPayload): PosPaymentPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as PosPaymentPayload;
}

function toOrderItem(line: PosCartLine): PosOrderItem {
  return {
    menuItemId: line.menuItemId,
    menuItemName: line.name,
    quantity: line.quantity,
    price: line.basePrice,
    subtotal: line.subtotal,
    ...(line.note ? { specialInstructions: line.note } : {}),
    ...(line.selections.length > 0
      ? {
          variationSelections: line.selections.map((s) => ({
            typeName: s.groupName,
            optionName: s.optionName,
            priceAdjustment: s.priceModifier,
          })),
        }
      : {}),
  };
}

function paymentPayload(tender: PosTender, cashierId?: string): PosPaymentPayload {
  const cash = tender.isCash
    ? { cashTendered: tender.cashTendered, changeDue: tender.changeDue }
    : {};
  return compact({
    ...cash,
    proofUrl: tender.proofUrl,
    proofFileId: tender.proofFileId,
    reference: tender.reference,
    cashierId,
  });
}

/**
 * Build the createOrder arguments for a counter sale.
 *
 * @throws if the cart is empty, or if a cash sale's tender does not cover the
 * total — the register must not be able to write a short-paid order.
 */
export function buildPosOrder(context: PosOrderContext): PosOrderArgs {
  const { cart, tender, serviceCharge } = context;

  if (cart.length === 0) {
    throw new Error("Cannot complete a sale with an empty cart.");
  }

  const deliveryFee = chargeableDeliveryFee(context.delivery);
  // `chargeAmount` is the charge as LEVIED — computed from the cart before any
  // discount, because a discount comes off after service is charged. Reporting
  // the net would understate what the shop actually took for service, and the
  // discount is already recorded on its own rows.
  const { total, itemCount, discountTotal, serviceCharge: chargeAmount } = cartTotals(
    cart,
    serviceCharge,
    context.discounts,
    deliveryFee,
  );

  if (tender.isCash && !computeChange(total, tender.cashTendered ?? 0).isSufficient) {
    throw new Error("Insufficient cash tendered for this sale.");
  }

  const deliveryBlob = deliveryCustomerData(context.delivery);

  return {
    customerName: context.customerName?.trim() || POS_WALK_IN_NAME,
    // An attached guest's contact wins — identity resolution runs on it. The
    // typed delivery phone fills in only for an otherwise-anonymous sale, so
    // the order still lands on a customer profile.
    customerContact: context.customerContact || deliveryBlob.customer_phone || "",
    customerData: {
      // The branch is stamped by the register, not accepted from the caller,
      // so a counter sale is always attributable to the till that rang it.
      ...withOrderOutlet(context.customerData, context.outlet),
      ...deliveryBlob,
      ...tableCustomerData(context.table),
      // Spread before `pos` so a discount can never displace the payment
      // payload — both live in this blob and both are needed to settle a sale.
      ...discountBlob(context.discounts, discountTotal),
      pos: paymentPayload(tender, context.cashierId),
    },
    total,
    ...(deliveryFee > 0 ? { deliveryFee } : {}),
    ...(chargeAmount > 0 ? { serviceCharge: chargeAmount } : {}),
    ...(deliveryBlob.delivery_address
      ? { deliveryAddress: deliveryBlob.delivery_address }
      : {}),
    orderType: context.orderType,
    orderTypeId: context.orderTypeId,
    source: "pos",
    clientOrderId: context.clientOrderId,
    itemCount,
    paymentMethod: tender.methodName,
    paymentMethodDetails: tender.methodDetails,
    items: cart.map(toOrderItem),
  };
}

/**
 * Read the POS payment payload off an order's `customerData`.
 *
 * Returns null for orders that did not come from the register, and for
 * malformed blobs — the blob is untyped at the database edge, so a reader
 * must never assume its shape.
 */
export function readPosPayment(customerData: unknown): PosPaymentPayload | null {
  if (typeof customerData !== "object" || customerData === null) return null;

  const { pos } = customerData as { pos?: unknown };
  if (typeof pos !== "object" || pos === null || Array.isArray(pos)) return null;

  return pos as PosPaymentPayload;
}
