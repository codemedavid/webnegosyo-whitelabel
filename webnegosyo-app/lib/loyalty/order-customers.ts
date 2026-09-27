/**
 * Who is behind an order, and what it did to their stamp card — as the order
 * queue and the order screen say it.
 *
 * The shapes mirror `src/lib/loyalty/order-customers.ts`; the app is bundled
 * separately and cannot import from `src/`. The platform decides every fact
 * (membership, the stamp, the card) from the ledger; this file only puts
 * words to it, so the queue never claims a stamp the ledger does not hold.
 *
 * Pure — the transport lives in `order-customers-repo.ts`.
 */

import type { LoyaltyMemberProgress, LoyaltyMemberStatus, Tone } from "./members";

/** The shared-cache resource name; lives here so `lib/hooks.ts` can invalidate it without loading the transport. */
export const ORDER_CUSTOMERS_RESOURCE = "order-customers";

/** Mirrors the platform's per-request ceiling. */
export const MAX_ORDERS_PER_REQUEST = 100;

/** A customerData value longer than this is a URL or a note, never a phone. */
const MAX_FIELD_LENGTH = 120;

export type OrderStampState = "earned" | "returned" | "pending" | "none";

export interface OrderCustomerSummary {
  orderId: string;
  customerKey: string;
  customerId: string | null;
  name: string | null;
  hasProfile: boolean;
  orderCount: number | null;
  totalSpent: number | null;
  isMember: boolean;
  status: LoyaltyMemberStatus | null;
  headline: LoyaltyMemberProgress | null;
  rewardsAvailable: number;
  stamp: {
    state: OrderStampState;
    delta: number;
    programId: string | null;
    programName: string | null;
  };
}

export interface OrderCustomerQuery {
  orderId: string;
  contact: string | null;
  status: string | null;
  customerData: Record<string, string> | null;
}

export interface OrderCustomerSource {
  _id: string;
  customerContact?: string | null;
  status?: string | null;
  customerData?: Record<string, unknown> | null;
}

export interface OrderCustomerBadge {
  label: string;
  tone: Tone;
}

export interface OrderStampCopy {
  title: string;
  detail: string | null;
  tone: Tone;
}

function unitOf(progress: LoyaltyMemberProgress | null, count: number): string {
  const unit = progress?.earnMode === "points" ? "point" : "stamp";
  return `${unit}${count === 1 ? "" : "s"}`;
}

function cardFraction(progress: LoyaltyMemberProgress | null): string | null {
  if (!progress || progress.threshold <= 0) return null;
  const balance = Number.isInteger(progress.balance) ? String(progress.balance) : progress.balance.toFixed(1);
  return `${balance}/${progress.threshold}`;
}

/**
 * The one chip on an order row.
 *
 * Precedence is what the cashier acts on: a reward waiting to be handed over,
 * then the stamp this order earned, then membership, then plain familiarity.
 */
export function describeOrderCustomerBadge(summary: OrderCustomerSummary): OrderCustomerBadge {
  if (summary.rewardsAvailable > 0) return { label: "Reward ready", tone: "accent" };

  const fraction = cardFraction(summary.headline);
  if (summary.stamp.state === "earned" && summary.stamp.delta > 0) {
    const earned = `+${summary.stamp.delta} ${unitOf(summary.headline, summary.stamp.delta)}`;
    return { label: fraction ? `${earned} · ${fraction}` : earned, tone: "success" };
  }

  if (summary.isMember) return { label: fraction ? `Member · ${fraction}` : "Member", tone: "accent" };

  const orders = summary.orderCount ?? 0;
  if (orders > 1) return { label: `Regular · ${orders} orders`, tone: "neutral" };
  return { label: "New customer", tone: "neutral" };
}

/**
 * What this order did to the card, for the order screen.
 *
 * Null when there is nothing honest to say: a store whose card is not running
 * must not print "no stamp", which reads as "you missed out".
 */
export function describeOrderStamp(
  summary: OrderCustomerSummary,
  isLoyaltyLive = true,
): OrderStampCopy | null {
  const { stamp } = summary;
  const onProgram = stamp.programName ? `On ${stamp.programName}` : null;

  switch (stamp.state) {
    case "earned":
      return {
        title: `Earned ${stamp.delta} ${unitOf(summary.headline, stamp.delta)}`,
        detail: onProgram,
        tone: "success",
      };
    case "returned":
      return {
        title: "Stamp returned",
        detail: "This order earned a stamp, then was cancelled or refunded.",
        tone: "warning",
      };
    case "pending":
      return {
        title: "Stamp on completion",
        detail: "The stamp lands once this order is completed and paid.",
        tone: "neutral",
      };
    default:
      if (!isLoyaltyLive) return null;
      return {
        title: "No stamp on this order",
        detail: "It did not qualify, or it was placed before the card started.",
        tone: "neutral",
      };
  }
}

function compactCustomerData(data: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!data) return null;
  const entries = Object.entries(data).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim() !== "" && entry[1].length <= MAX_FIELD_LENGTH,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * What the platform needs to recognise an order's customer.
 *
 * Only short text fields: the platform finds the phone in whatever field the
 * merchant's checkout named it, but payment-proof URLs and item lists would
 * push a page of orders past the request limit for nothing.
 */
export function toOrderCustomerQuery(order: OrderCustomerSource): OrderCustomerQuery {
  const contact = typeof order.customerContact === "string" ? order.customerContact.trim() : "";
  return {
    orderId: order._id,
    contact: contact || null,
    status: order.status ?? null,
    customerData: compactCustomerData(order.customerData),
  };
}

export function chunkOrderQueries(queries: OrderCustomerQuery[]): OrderCustomerQuery[][] {
  const chunks: OrderCustomerQuery[][] = [];
  for (let start = 0; start < queries.length; start += MAX_ORDERS_PER_REQUEST) {
    chunks.push(queries.slice(start, start + MAX_ORDERS_PER_REQUEST));
  }
  return chunks;
}
