// Kitchen display ticket logic. Pure functions only (no React, no Convex) so
// the board's behavior — which orders are tickets, their cook order, what bump
// and recall mean, and the all-day roll-up — is unit-testable and shared with
// nothing screen-shaped.
//
// The board shows `confirmed` and `preparing` orders: `pending` is the
// cashier's decision to make (accepting the order), and `ready` means the
// kitchen is done with it. Bumping a ticket therefore always lands on `ready`,
// and recalling a bump puts the ticket back mid-cook as `preparing`.

export const KITCHEN_ACTIVE_STATUSES = ["confirmed", "preparing"] as const;

export type KitchenActiveStatus = (typeof KITCHEN_ACTIVE_STATUSES)[number];

export interface KitchenOrderLike {
  _id: string;
  _creationTime: number;
  customerName: string;
  status: string;
  orderType?: string;
  outletId?: string;
  /** Minutes the kitchen committed to, when a chef has set one. */
  prepMinutes?: number;
  /** Absolute instant promised (ISO). Absent = no promise made yet. */
  promisedReadyAt?: string;
  /** Raw checkout payload; carries `table_number` for a seated order. */
  customerData?: Record<string, unknown> | null;
  /** The day's order number the cashier sees ("#12"); absent on older rows. */
  dailyNumber?: number | null;
  /** Requested time of a pre-order (UTC ISO). Absent = cook now. */
  scheduledFor?: string | null;
}

export interface KitchenItemLike {
  orderId: string;
  menuItemName: string;
  quantity: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string; priceAdjustment?: number }[];
  addons?: { name: string; price?: number; quantity?: number }[];
  specialInstructions?: string;
  /** Set on the lines of a combo, so the board can fold them under its name. */
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  /** The combo slot this line fills ("Drink", "Side"). */
  slotName?: string;
}

export interface KitchenTicket<
  O extends KitchenOrderLike = KitchenOrderLike,
  I extends KitchenItemLike = KitchenItemLike,
> {
  order: O;
  items: I[];
}

/**
 * The active board: confirmed + preparing orders, oldest first (the ticket
 * waiting longest is cooked first), each joined to its line items. Loading
 * inputs (undefined) yield an empty board rather than a crash.
 */
export function selectKitchenTickets<O extends KitchenOrderLike, I extends KitchenItemLike>(
  orders: readonly O[] | undefined,
  items: readonly I[] | undefined,
): KitchenTicket<O, I>[] {
  if (!orders) return [];

  // One pass, pushing into per-order arrays this function owns. The previous
  // `[...existing, item]` copied the order's array on every line — quadratic
  // in lines per order, on a 10k-row read that re-runs on every poll.
  const itemsByOrder = new Map<string, I[]>();
  for (const item of items ?? []) {
    const grouped = itemsByOrder.get(item.orderId);
    if (grouped) {
      grouped.push(item);
    } else {
      itemsByOrder.set(item.orderId, [item]);
    }
  }

  return orders
    .filter((order) => (KITCHEN_ACTIVE_STATUSES as readonly string[]).includes(order.status))
    .slice()
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((order) => ({ order, items: itemsByOrder.get(order._id) ?? [] }));
}

/**
 * Bumping means "done cooking" — any active ticket lands on ready. The current
 * status is accepted (and deliberately ignored) so call sites read as a
 * transition and the day a status-dependent bump is needed, no caller changes.
 */
export function bumpTargetStatus(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  status: string,
): "ready" {
  return "ready";
}

/** Recalling a bump puts the ticket back on the board mid-cook. */
export function recallTargetStatus(): "preparing" {
  return "preparing";
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * Elapsed cook time as "4m" / "1h 12m" / "91d 5h"; clock skew clamps to "0m".
 *
 * The day rollover is not cosmetic. An order left confirmed for months (they
 * exist on real stores) rendered "2189h 26m", which a cook cannot read as any
 * span of time at all.
 */
export function formatTicketTimer(creationTimeMs: number, nowMs: number): string {
  const elapsed = Math.max(0, nowMs - creationTimeMs);
  const minutes = Math.floor(elapsed / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h ${minutes % MINUTES_PER_HOUR}m`;

  return `${Math.floor(hours / HOURS_PER_DAY)}d ${hours % HOURS_PER_DAY}h`;
}

export interface NewTicketScan {
  /** Tickets that arrived since the last scan — the ones worth flashing. */
  newIds: ReadonlySet<string>;
  /** The seen-set to carry into the next scan. */
  seen: ReadonlySet<string> | null;
}

/**
 * Which tickets are genuinely new since the last look.
 *
 * `undefined` means the orders query has not answered yet and MUST be
 * distinguished from `[]` ("answered: nothing active"). The board originally
 * conflated them: the screen always held an array, so the very first render
 * seeded the seen-set as empty, and every ticket in the first real batch then
 * counted as new. On a live store that flashed the whole board on open.
 */
export function scanNewTickets(
  prevSeen: ReadonlySet<string> | null,
  orderIds: readonly string[] | undefined,
): NewTicketScan {
  // Still loading — seeding now is the bug; keep whatever we already knew.
  if (orderIds === undefined) {
    return { newIds: new Set(), seen: prevSeen };
  }

  const seen = new Set(orderIds);

  // First answered snapshot: adopt it wholesale. Tickets that were already on
  // the board when the cook walked up did not just arrive.
  if (prevSeen === null) {
    return { newIds: new Set(), seen };
  }

  return {
    newIds: new Set(orderIds.filter((id) => !prevSeen.has(id))),
    seen,
  };
}

export interface AllDayLine {
  label: string;
  quantity: number;
}

/** "Burger (Large)" — the item as the kitchen distinguishes it. */
export function kitchenItemLabel(item: KitchenItemLike): string {
  const selections = item.variationSelections
    ?.map((selection) => selection.optionName)
    .filter(Boolean);
  const detail =
    selections && selections.length > 0 ? selections.join(", ") : item.variation;
  return detail ? `${item.menuItemName} (${detail})` : item.menuItemName;
}

/**
 * The all-day view: total quantity of each distinct item (name + variation)
 * across every active ticket, busiest first. Ties keep first-seen order so the
 * strip is stable while the board updates.
 */
export function aggregateAllDay(tickets: readonly KitchenTicket[]): AllDayLine[] {
  const totals = new Map<string, number>();
  for (const ticket of tickets) {
    for (const item of ticket.items) {
      const label = kitchenItemLabel(item);
      totals.set(label, (totals.get(label) ?? 0) + item.quantity);
    }
  }
  return [...totals.entries()]
    .map(([label, quantity]) => ({ label, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}

const WHITESPACE_RUN = /\s+/g;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(WHITESPACE_RUN, " ").trim() : "";
}

/**
 * How the dish varies, one line per choice group: "Size: Large",
 * "Add-ons: Cheese, Egg ×2". Several picks from one group share its line, in
 * the order they were chosen. A line with no grouped choices falls back to the
 * flat `variation` text web checkout writes ("Fried, Garlic").
 *
 * The board used to squeeze all of this into brackets after the dish name, so
 * "Milk Tea (UPSIZE, Iced, 50%)" never said which choice was which and a long
 * order read as one run-on line.
 */
export function kitchenOptionLines(item: Pick<KitchenItemLike, "variation" | "variationSelections">): string[] {
  const groups: { title: string; options: string[] }[] = [];
  for (const selection of item.variationSelections ?? []) {
    const option = cleanText(selection?.optionName);
    if (!option) continue;
    const title = cleanText(selection?.typeName);
    const group = groups.find((entry) => entry.title.toLowerCase() === title.toLowerCase());
    if (group) {
      group.options.push(option);
    } else {
      groups.push({ title, options: [option] });
    }
  }
  if (groups.length > 0) {
    return groups.map(({ title, options }) =>
      title ? `${title}: ${options.join(", ")}` : options.join(", "),
    );
  }
  const variation = cleanText(item.variation);
  return variation ? [variation] : [];
}

/** "×2" / "x2" already on the end of a name (web checkout writes it in). */
const TRAILING_QUANTITY = /[×x]\s*\d+$/i;

/**
 * Add-ons as the cook reads them: "Extra Shot ×2". The platform stores names
 * with the count already written in; Convex keeps it in `quantity` — which the
 * board dropped, so two extra shots read as one.
 */
export function kitchenAddonLines(item: Pick<KitchenItemLike, "addons">): string[] {
  const lines: string[] = [];
  for (const addon of item.addons ?? []) {
    const name = cleanText(addon?.name);
    if (!name) continue;
    const quantity = addon?.quantity;
    const needsCount =
      typeof quantity === "number" && Number.isFinite(quantity) && quantity > 1 && !TRAILING_QUANTITY.test(name);
    lines.push(needsCount ? `${name} ×${quantity}` : name);
  }
  return lines;
}

export type KitchenTicketSection =
  | { kind: "item"; index: number }
  | { kind: "combo"; bundleId: string; bundleName: string; indexes: number[] };

const DEFAULT_COMBO_NAME = "Combo";

/**
 * A ticket's lines in the order they were rung up, with each combo's lines
 * folded under one heading where its first line stood. Indexes point into the
 * ticket's `items`, so a struck-through line stays struck however it is drawn.
 */
export function kitchenTicketSections(
  items: readonly Pick<KitchenItemLike, "isBundleItem" | "bundleId" | "bundleName">[],
): KitchenTicketSection[] {
  const sections: KitchenTicketSection[] = [];
  const combos = new Map<string, Extract<KitchenTicketSection, { kind: "combo" }>>();
  items.forEach((item, index) => {
    const bundleId = item.isBundleItem ? cleanText(item.bundleId) : "";
    if (!bundleId) {
      sections.push({ kind: "item", index });
      return;
    }
    const existing = combos.get(bundleId);
    if (existing) {
      existing.indexes.push(index);
      return;
    }
    const combo = {
      kind: "combo" as const,
      bundleId,
      bundleName: cleanText(item.bundleName) || DEFAULT_COMBO_NAME,
      indexes: [index],
    };
    combos.set(bundleId, combo);
    sections.push(combo);
  });
  return sections;
}
