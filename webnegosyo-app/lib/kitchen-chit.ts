// The kitchen chit — the paper ticket the cooks work from. Deliberately not a
// receipt: no prices, no totals, no branding. What to make, how it varies, and
// any note the customer left. Pure text-building so it is unit-testable and
// prints through the same segment pipeline as receipts (lib/printer.ts).

import type { PrintSegment } from "./printer";
import { getOrderTypeMeta } from "./order-visuals";
import {
  kitchenAddonLines,
  kitchenOptionLines,
  kitchenTicketSections,
  type KitchenItemLike,
} from "./kitchen-tickets";
import { kitchenNotesOf } from "./kitchen-order-note";
import { formatDailyOrderNumber } from "./order-number";
import { getScheduledLabel } from "./scheduled-orders";

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
  /** The day's order number ("#12"); absent prints the id reference. */
  dailyNumber?: number | null;
  /** A pre-order's requested time (UTC ISO); absent = cook now. */
  scheduledFor?: string | null;
}

type ChitItem = KitchenChitOrder["items"][number];

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

/**
 * One line item: "2x Burger", then each choice group, add-on and note on its
 * own indented line — the same breakdown as the board's ticket card.
 * `indent` nests a combo's lines under the combo's heading.
 */
function chitItemLines(item: ChitItem, indent = ""): string[] {
  const slot = item.isBundleItem && item.slotName ? item.slotName.trim() : "";
  const lines = wrapChitText(
    `${item.quantity}x ${slot ? `[${slot}] ` : ""}${item.menuItemName}`,
    CHIT_WIDTH,
    indent,
    `${indent}   `,
  );
  const detailIndent = `${indent}   `;
  for (const option of kitchenOptionLines(item)) {
    lines.push(...wrapChitText(option, CHIT_WIDTH, `${detailIndent}- `, `${detailIndent}  `));
  }
  for (const addon of kitchenAddonLines(item)) {
    lines.push(...wrapChitText(addon, CHIT_WIDTH, `${detailIndent}+ `, `${detailIndent}  `));
  }
  if (item.specialInstructions) {
    lines.push(
      ...wrapChitText(`${item.specialInstructions} **`, CHIT_WIDTH, `${detailIndent}** `, `${detailIndent}   `),
    );
  }
  return lines;
}

/** Every line in rung-up order, each combo's lines under a COMBO heading. */
function chitItemsLines(items: readonly ChitItem[]): string[] {
  return kitchenTicketSections(items).flatMap((section) =>
    section.kind === "item"
      ? chitItemLines(items[section.index])
      : [
          ...wrapChitText(`COMBO: ${section.bundleName}`, CHIT_WIDTH, "", "  "),
          ...section.indexes.flatMap((index) => chitItemLines(items[index], "  ")),
        ],
  );
}

/** "12" when the day's number is known, else the id reference chits always printed. */
function chitOrderRef(order: KitchenChitOrder): string {
  const daily = formatDailyOrderNumber(order.dailyNumber).replace(/^#/, "");
  return daily || order._id.slice(-8).toUpperCase();
}

/** "For: Thu, Nov 14 · 5:30 PM" on a pre-order; nothing otherwise. */
function chitScheduleLines(order: KitchenChitOrder): string[] {
  const customerData =
    typeof order.customerData === "object" && order.customerData !== null && !Array.isArray(order.customerData)
      ? (order.customerData as Record<string, unknown>)
      : null;
  const label = getScheduledLabel({
    _id: order._id,
    status: "",
    scheduledFor: order.scheduledFor,
    customerData,
  });
  return label ? wrapChitText(`SCHEDULED: ${label}`, CHIT_WIDTH, "", "  ") : [];
}

/** The order's own note(s), wrapped, with a divider under them; none = nothing. */
function chitNoteLines(customerData: unknown): string[] {
  const notes = kitchenNotesOf(customerData);
  if (notes.length === 0) return [];
  return [...notes.flatMap((note) => wrapChitText(note, CHIT_WIDTH, "NOTE: ", "      ")), DIVIDER];
}

/** Set only on a chit printed again by hand: the cooks must not cook it twice. */
export interface KitchenChitOptions {
  /** When the copy was printed (epoch ms). */
  reprintAt?: number;
}

/** "*** REPRINT ***" and its time, under the KITCHEN header; nothing on a first print. */
function chitReprintLines(options: KitchenChitOptions): string[] {
  const at = options.reprintAt;
  if (typeof at !== "number" || !Number.isFinite(at)) return [];
  const timeStr = new Date(at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return [center("*** REPRINT ***"), center(`Reprinted ${timeStr}`)];
}

export function buildKitchenChitText(order: KitchenChitOrder, options: KitchenChitOptions = {}): string {
  const typeLabel = order.orderType ? getOrderTypeMeta(order.orderType).label : null;

  const lines = [
    center("*** KITCHEN ***"),
    ...chitReprintLines(options),
    DIVIDER,
    `Order #: ${chitOrderRef(order)}`,
    chitTimeLine(order._creationTime),
    ...chitScheduleLines(order),
    ...(typeLabel ? [`Type: ${typeLabel}`] : []),
    `For: ${order.customerName}`,
    DIVIDER,
    ...chitNoteLines(order.customerData),
    ...chitItemsLines(order.items),
    DIVIDER,
  ];

  return lines.join("\n") + "\n";
}

/** The chit as a single text segment for printReceiptSegments. */
export function buildKitchenChitSegments(
  order: KitchenChitOrder,
  options: KitchenChitOptions = {},
): PrintSegment[] {
  return [{ type: "text", text: buildKitchenChitText(order, options) }];
}
