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
}

export interface KitchenItemLike {
  orderId: string;
  menuItemName: string;
  quantity: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string; priceAdjustment?: number }[];
  addons?: { name: string; price?: number }[];
  specialInstructions?: string;
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

  const itemsByOrder = new Map<string, I[]>();
  for (const item of items ?? []) {
    const existing = itemsByOrder.get(item.orderId) ?? [];
    itemsByOrder.set(item.orderId, [...existing, item]);
  }

  return orders
    .filter((order) => (KITCHEN_ACTIVE_STATUSES as readonly string[]).includes(order.status))
    .slice()
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((order) => ({ order, items: itemsByOrder.get(order._id) ?? [] }));
}

/** Bumping means "done cooking" — any active ticket lands on ready. */
export function bumpTargetStatus(_status: string): "ready" {
  return "ready";
}

/** Recalling a bump puts the ticket back on the board mid-cook. */
export function recallTargetStatus(): "preparing" {
  return "preparing";
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** Elapsed cook time as "4m" / "1h 12m"; clock skew clamps to "0m". */
export function formatTicketTimer(creationTimeMs: number, nowMs: number): string {
  const elapsed = Math.max(0, nowMs - creationTimeMs);
  const minutes = Math.floor(elapsed / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${hours}h ${minutes % MINUTES_PER_HOUR}m`;
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
