// The kitchen chit — the paper ticket the cooks work from. Deliberately not a
// receipt: no prices, no totals, no branding. What to make, how it varies, and
// any note the customer left. Pure text-building so it is unit-testable and
// prints through the same segment pipeline as receipts (lib/printer.ts).

import type { PrintSegment } from "./printer";
import { getOrderTypeMeta } from "./order-visuals";
import { kitchenItemLabel, type KitchenItemLike } from "./kitchen-tickets";
import { kitchenNotesOf } from "./kitchen-order-note";

export interface KitchenChitOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  orderType?: string;
  items: (KitchenItemLike | Omit<KitchenItemLike, "orderId">)[];
  /**
   * The order's checkout answers. Only the note-like ones print, as
   * `NOTE: …` (`kitchenNotesOf`); absent prints no note.
   */
  customerData?: unknown;
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

/**
 * `text` broken into lines of at most `width` characters, on spaces where it
 * can; a word longer than the line is cut. Continuation lines get `indent`.
 */
export function wrapChitText(text: string, width: number, firstPrefix: string, indent: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = firstPrefix;
  let isLineEmpty = true;
  for (const word of words) {
    const prefix = lines.length === 0 ? firstPrefix : indent;
    const room = width - prefix.length;
    const chunks = word.length > room ? (word.match(new RegExp(`.{1,${room}}`, "g")) ?? [word]) : [word];
    for (const chunk of chunks) {
      const candidate = isLineEmpty ? `${current}${chunk}` : `${current} ${chunk}`;
      if (candidate.length <= width) {
        current = candidate;
        isLineEmpty = false;
        continue;
      }
      lines.push(current);
      current = `${indent}${chunk}`;
      isLineEmpty = false;
    }
  }
  if (!isLineEmpty) lines.push(current);
  return lines;
}

/** One line item: "2x Burger (Large)" plus indented addon and note lines. */
function chitItemLines(item: KitchenChitOrder["items"][number]): string[] {
  const lines = [`${item.quantity}x ${kitchenItemLabel(item as KitchenItemLike)}`];
  for (const addon of item.addons ?? []) {
    lines.push(`   + ${addon.name}`);
  }
  if (item.specialInstructions) {
    lines.push(...wrapChitText(`${item.specialInstructions} **`, CHIT_WIDTH, "   ** ", "      "));
  }
  return lines;
}

/** The order's own note(s), wrapped, with a divider under them; none = nothing. */
function chitNoteLines(customerData: unknown): string[] {
  const notes = kitchenNotesOf(customerData);
  if (notes.length === 0) return [];
  return [...notes.flatMap((note) => wrapChitText(note, CHIT_WIDTH, "NOTE: ", "      ")), DIVIDER];
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
    ...chitNoteLines(order.customerData),
    ...order.items.flatMap(chitItemLines),
    DIVIDER,
  ];

  return lines.join("\n") + "\n";
}

/** The chit as a single text segment for printReceiptSegments. */
export function buildKitchenChitSegments(order: KitchenChitOrder): PrintSegment[] {
  return [{ type: "text", text: buildKitchenChitText(order) }];
}
