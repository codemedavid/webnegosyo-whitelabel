// Kitchen display ticket logic. The screen (app/(main)/kitchen.tsx) is a thin
// shell over these pure functions: which orders become tickets, how they are
// ordered, when a ticket counts as late, what bumping and recalling do to an
// order's status, and the all-day item roll-up across active tickets.
import {
  KITCHEN_ACTIVE_STATUSES,
  selectKitchenTickets,
  bumpTargetStatus,
  recallTargetStatus,
  formatTicketTimer,
  aggregateAllDay,
  type KitchenOrderLike,
  type KitchenItemLike,
} from "./kitchen-tickets";

const MINUTE = 60_000;

function order(overrides: Partial<KitchenOrderLike> & { _id: string }): KitchenOrderLike {
  return {
    _creationTime: 1_000_000,
    customerName: "Maria",
    status: "confirmed",
    ...overrides,
  };
}

function item(overrides: Partial<KitchenItemLike> & { orderId: string }): KitchenItemLike {
  return {
    menuItemName: "Burger",
    quantity: 1,
    ...overrides,
  };
}

describe("selectKitchenTickets", () => {
  it("keeps only confirmed and preparing orders — the kitchen's active board", () => {
    // Arrange
    const orders = [
      order({ _id: "a", status: "pending" }),
      order({ _id: "b", status: "confirmed" }),
      order({ _id: "c", status: "preparing" }),
      order({ _id: "d", status: "ready" }),
      order({ _id: "e", status: "delivered" }),
      order({ _id: "f", status: "cancelled" }),
    ];

    // Act
    const tickets = selectKitchenTickets(orders, []);

    // Assert
    expect(tickets.map((t) => t.order._id)).toEqual(["b", "c"]);
    expect(KITCHEN_ACTIVE_STATUSES).toEqual(["confirmed", "preparing"]);
  });

  it("sorts oldest first — the ticket waiting longest is cooked first", () => {
    const orders = [
      order({ _id: "new", _creationTime: 3_000 }),
      order({ _id: "old", _creationTime: 1_000 }),
      order({ _id: "mid", _creationTime: 2_000 }),
    ];

    const tickets = selectKitchenTickets(orders, []);

    expect(tickets.map((t) => t.order._id)).toEqual(["old", "mid", "new"]);
  });

  it("joins each order's line items by orderId, preserving modifiers", () => {
    const orders = [order({ _id: "o1" })];
    const items = [
      item({ orderId: "o1", menuItemName: "Burger", quantity: 2, variation: "Large" }),
      item({ orderId: "o1", menuItemName: "Coke", specialInstructions: "no ice" }),
      item({ orderId: "other", menuItemName: "Fries" }),
    ];

    const tickets = selectKitchenTickets(orders, items);

    expect(tickets[0].items).toHaveLength(2);
    expect(tickets[0].items[0]).toMatchObject({ menuItemName: "Burger", quantity: 2, variation: "Large" });
    expect(tickets[0].items[1]).toMatchObject({ specialInstructions: "no ice" });
  });

  it("returns an empty list when orders are still loading (undefined)", () => {
    expect(selectKitchenTickets(undefined, undefined)).toEqual([]);
  });
});

describe("bump and recall transitions", () => {
  it("bumping any active ticket marks it ready — done cooking", () => {
    expect(bumpTargetStatus("confirmed")).toBe("ready");
    expect(bumpTargetStatus("preparing")).toBe("ready");
  });

  it("recalling a bumped ticket puts it back on the board as preparing", () => {
    expect(recallTargetStatus()).toBe("preparing");
  });
});

describe("formatTicketTimer", () => {
  it("shows minutes under an hour", () => {
    expect(formatTicketTimer(0, 4 * MINUTE)).toBe("4m");
  });

  it("shows hours and minutes past an hour", () => {
    expect(formatTicketTimer(0, 72 * MINUTE)).toBe("1h 12m");
  });

  it("never goes negative on clock skew", () => {
    expect(formatTicketTimer(5_000, 0)).toBe("0m");
  });
});

describe("aggregateAllDay", () => {
  it("sums quantities of the same item across tickets, keyed by name + variation", () => {
    const orders = [order({ _id: "o1" }), order({ _id: "o2" })];
    const items = [
      item({ orderId: "o1", menuItemName: "Burger", quantity: 2, variation: "Large" }),
      item({ orderId: "o2", menuItemName: "Burger", quantity: 1, variation: "Large" }),
      item({ orderId: "o2", menuItemName: "Burger", quantity: 1, variation: "Small" }),
      item({ orderId: "o2", menuItemName: "Coke", quantity: 3 }),
    ];
    const tickets = selectKitchenTickets(orders, items);

    const allDay = aggregateAllDay(tickets);

    expect(allDay).toEqual([
      { label: "Burger (Large)", quantity: 3 },
      { label: "Coke", quantity: 3 },
      { label: "Burger (Small)", quantity: 1 },
    ]);
  });

  it("folds grouped variation selections into the label", () => {
    const orders = [order({ _id: "o1" })];
    const items = [
      item({
        orderId: "o1",
        menuItemName: "Milk Tea",
        quantity: 2,
        variationSelections: [
          { typeName: "Size", optionName: "Large", priceAdjustment: 0 },
          { typeName: "Sugar", optionName: "50%", priceAdjustment: 0 },
        ],
      }),
    ];

    const allDay = aggregateAllDay(selectKitchenTickets(orders, items));

    expect(allDay).toEqual([{ label: "Milk Tea (Large, 50%)", quantity: 2 }]);
  });

  it("is empty for an empty board", () => {
    expect(aggregateAllDay([])).toEqual([]);
  });
});
