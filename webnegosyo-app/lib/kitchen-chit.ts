// The kitchen chit — the paper ticket the cooks work from. Deliberately not a
// receipt: no prices, no totals, no branding. What to make, how it varies, and
// any note the customer left. Pure text-building so it is unit-testable and
// prints through the same segment pipeline as receipts (lib/printer.ts).

import type { PrintSegment } from "./printer";
import { getOrderTypeMeta } from "./order-visuals";
import { kitchenItemLabel, type KitchenItemLike } from "./kitchen-tickets";

export interface KitchenChitOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  orderType?: string;
  items: (KitchenItemLike | Omit<KitchenItemLike, "orderId">)[];
}

/** 58mm printhead width in characters, matching the receipt layouts. */
const CHIT_WIDTH = 32;

const DIVIDER = "-".repeat(CHIT_WIDTH);

function center(text: string): string {
  const pad = Math.max(0, Math.floor((CHIT_WIDTH - text.length) / 2));
  return " ".repeat(pad) + text;
}

function chitTimeLine(creationTimeMs: number): string {
  const date = new Date(creationTimeMs);
  const timeStr = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return `Time: ${timeStr}`;
}

/** One line item: "2x Burger (Large)" plus indented addon and note lines. */
function chitItemLines(item: KitchenChitOrder["items"][number]): string[] {
  const lines = [`${item.quantity}x ${kitchenItemLabel(item as KitchenItemLike)}`];
  for (const addon of item.addons ?? []) {
    lines.push(`   + ${addon.name}`);
  }
  if (item.specialInstructions) {
    lines.push(`   ** ${item.specialInstructions} **`);
  }
  return lines;
}

export function buildKitchenChitText(order: KitchenChitOrder): string {
  const typeLabel = order.orderType ? getOrderTypeMeta(order.orderType).label : null;

  const lines = [
    center("*** KITCHEN ***"),
    DIVIDER,
    `Order #: ${order._id.slice(-8).toUpperCase()}`,
    chitTimeLine(order._creationTime),
    ...(typeLabel ? [`Type: ${typeLabel}`] : []),
    `For: ${order.customerName}`,
    DIVIDER,
    ...order.items.flatMap(chitItemLines),
    DIVIDER,
  ];

  return lines.join("\n") + "\n";
}

/** The chit as a single text segment for printReceiptSegments. */
export function buildKitchenChitSegments(order: KitchenChitOrder): PrintSegment[] {
  return [{ type: "text", text: buildKitchenChitText(order) }];
}
