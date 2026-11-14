/**
 * The kitchen ticket card.
 *
 * The pure board logic (which orders become tickets, their order, the all-day
 * roll-up) is covered in `lib/kitchen-tickets.test.ts`. What that cannot see is
 * the card itself — and the card is the whole product here: a cook reads it
 * from across a hot line and taps it with a wet glove. These tests pin what
 * actually reaches the screen (every line, its modifiers, the note that stops
 * an allergy incident) and that the two destructive-ish affordances — bump and
 * print — fire with the right order.
 *
 * The live simulator run could not cover any of this: the public demo store has
 * no confirmed or preparing orders, so the board renders its empty state, and
 * manufacturing a ticket would have meant mutating a real store.
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react-native";
import { TicketCard } from "./TicketCard";
import type { KitchenTicket } from "../../lib/kitchen-tickets";

const NOW = new Date("2026-08-29T12:00:00").getTime();
const MINUTE = 60_000;

function ticket(overrides: Partial<KitchenTicket> = {}): KitchenTicket {
  return {
    order: {
      _id: "j57abc123xyz789ef",
      _creationTime: NOW - 4 * MINUTE,
      customerName: "Maria Santos",
      status: "confirmed",
      orderType: "dine-in",
    },
    items: [
      {
        orderId: "j57abc123xyz789ef",
        menuItemName: "Burger",
        quantity: 2,
        variation: "Large",
        addons: [{ name: "Extra Cheese", price: 25 }],
        specialInstructions: "no onions",
      },
      { orderId: "j57abc123xyz789ef", menuItemName: "Coke", quantity: 1 },
    ],
    ...overrides,
  };
}

// The card reads its clock from the shared ticker, falling back to the wall
// clock when rendered standalone as it is here. Pin that clock so the timer
// and the prep promise render against a fixed "now".
beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  jest.restoreAllMocks();
});

function renderCard(props: Partial<React.ComponentProps<typeof TicketCard>> = {}) {
  const onBump = jest.fn();
  const onPrint = jest.fn();
  const onSetPrepTime = jest.fn();
  const onConfirm = jest.fn();
  render(
    <TicketCard
      ticket={ticket()}
      isNew={false}
      kitchenStatus="waiting"
      rangAtMs={null}
      onConfirm={onConfirm}
      onBump={onBump}
      onPrint={onPrint}
      canPrint
      canSetPrepTime
      onSetPrepTime={onSetPrepTime}
      {...props}
    />,
  );
  return { onBump, onPrint, onSetPrepTime, onConfirm };
}

describe("ticket content", () => {
  it("shows the id reference the cashier's order card falls back to", () => {
    renderCard();
    expect(screen.getByText("#J57ABC12")).toBeTruthy();
  });

  it("shows the day's order number — the one the cashier calls out", () => {
    renderCard({ ticket: { ...ticket(), order: { ...ticket().order, dailyNumber: 12 } } });
    expect(screen.getByText("#12")).toBeTruthy();
  });

  it("lists every line with its quantity, the variation on its own line", () => {
    renderCard();
    expect(screen.getByText("2×")).toBeTruthy();
    expect(screen.getByText("Burger")).toBeTruthy();
    expect(screen.getByText("Large")).toBeTruthy();
    expect(screen.getByText("1×")).toBeTruthy();
    expect(screen.getByText("Coke")).toBeTruthy();
  });

  it("names each choice group, one line per group, picks from one group together", () => {
    renderCard({
      ticket: {
        ...ticket(),
        items: [
          {
            orderId: "j57abc123xyz789ef",
            menuItemName: "Milk Tea",
            quantity: 1,
            variationSelections: [
              { typeName: "SIZE", optionName: "UPSIZE", priceAdjustment: 10 },
              { typeName: "Sugar", optionName: "50%", priceAdjustment: 0 },
              { typeName: "Add-ons", optionName: "Pearls", priceAdjustment: 15 },
              { typeName: "Add-ons", optionName: "Cheese foam ×2", priceAdjustment: 40 },
              { typeName: "Options", optionName: "", priceAdjustment: 0 },
            ],
          },
        ],
      },
    });
    expect(screen.getByText("Milk Tea")).toBeTruthy();
    expect(screen.getByText("SIZE: UPSIZE")).toBeTruthy();
    expect(screen.getByText("Sugar: 50%")).toBeTruthy();
    expect(screen.getByText("Add-ons: Pearls, Cheese foam ×2")).toBeTruthy();
    // An empty pick from a group prints nothing, not "Options: ".
    expect(screen.queryByTestId("ticket-item-option-0-3")).toBeNull();
  });

  it("shows how many of each add-on, when the count rides in `quantity`", () => {
    renderCard({
      ticket: {
        ...ticket(),
        items: [
          {
            orderId: "j57abc123xyz789ef",
            menuItemName: "Latte",
            quantity: 1,
            addons: [
              { name: "Extra Shot", price: 30, quantity: 2 },
              // The platform writes the count into the name; never doubled.
              { name: "Oat Milk ×2", price: 0, quantity: 2 },
            ],
          },
        ],
      },
    });
    expect(screen.getByText("+ Extra Shot ×2")).toBeTruthy();
    expect(screen.getByText("+ Oat Milk ×2")).toBeTruthy();
  });

  it("folds a combo's lines under its name, each with the slot it fills", () => {
    const comboLine = {
      orderId: "j57abc123xyz789ef",
      quantity: 1,
      isBundleItem: true,
      bundleId: "b1",
      bundleName: "Family Meal",
    };
    renderCard({
      ticket: {
        ...ticket(),
        items: [
          { ...comboLine, menuItemName: "Fried Chicken", slotName: "Main" },
          { orderId: "j57abc123xyz789ef", menuItemName: "Halo-halo", quantity: 1 },
          {
            ...comboLine,
            menuItemName: "Iced Tea",
            slotName: "Drink",
            variationSelections: [{ typeName: "Size", optionName: "Large", priceAdjustment: 0 }],
          },
        ],
      },
    });
    const combo = screen.getByTestId("ticket-combo-b1");
    expect(within(combo).getByText("COMBO · Family Meal")).toBeTruthy();
    expect(within(combo).getByText("MAIN")).toBeTruthy();
    expect(within(combo).getByText("Fried Chicken")).toBeTruthy();
    expect(within(combo).getByText("DRINK")).toBeTruthy();
    expect(within(combo).getByText("Iced Tea")).toBeTruthy();
    expect(within(combo).getByText("Size: Large")).toBeTruthy();
    expect(within(combo).queryByText("Halo-halo")).toBeNull();
    expect(screen.getByText("Halo-halo")).toBeTruthy();
  });

  it("says when a pre-order is wanted", () => {
    renderCard({
      ticket: {
        ...ticket(),
        order: { ...ticket().order, customerData: { scheduled_for_label: "Sat, Nov 15 · 5:30 PM" } },
      },
    });
    expect(screen.getByText("SCHEDULED · Sat, Nov 15 · 5:30 PM")).toBeTruthy();
  });

  it("says nothing about a schedule on a cook-now order", () => {
    renderCard();
    expect(screen.queryByText(/SCHEDULED/)).toBeNull();
  });

  it("shows add-ons, so a cook does not plate a bare burger", () => {
    renderCard();
    expect(screen.getByText("+ Extra Cheese")).toBeTruthy();
  });

  it("shows the customer's note — the line that prevents an allergy incident", () => {
    renderCard();
    expect(screen.getByText("✱ no onions")).toBeTruthy();
  });

  it("boxes the item note so it reads from across the line", () => {
    renderCard();
    expect(screen.getByTestId("ticket-item-note-0")).toBeTruthy();
    expect(screen.queryByTestId("ticket-item-note-1")).toBeNull();
  });

  it("shows the order's own checkout note as a NOTE banner", () => {
    renderCard({
      ticket: {
        ...ticket(),
        order: {
          ...ticket().order,
          customerData: { "Special Instructions ": "birthday — add a candle", table_number: "4" },
        },
      },
    });
    expect(screen.getByText("NOTE")).toBeTruthy();
    expect(screen.getByText("birthday — add a candle")).toBeTruthy();
  });

  it("shows no banner without an order note, nor for the rider's note", () => {
    renderCard({
      ticket: {
        ...ticket(),
        order: { ...ticket().order, customerData: { delivery_rider_note: "call at the gate" } },
      },
    });
    expect(screen.queryByText("NOTE")).toBeNull();
    expect(screen.queryByText("call at the gate")).toBeNull();
  });

  it("shows the cook time elapsed, not a wall clock", () => {
    renderCard();
    expect(screen.getByText("4m")).toBeTruthy();
  });

  it("names the customer and the order type for routing the plate", () => {
    renderCard();
    expect(screen.getByText("DINE-IN")).toBeTruthy();
    expect(screen.getByText(/Maria Santos/)).toBeTruthy();
  });

  it("marks a ticket already under way so two cooks do not start it twice", () => {
    renderCard({ ticket: { ...ticket(), order: { ...ticket().order, status: "preparing" } } });
    expect(screen.getByText(/PREPARING/)).toBeTruthy();
  });

  it("says items are loading rather than showing an empty ticket", () => {
    // An empty item list on a real order reads as "nothing to cook", which is
    // the one wrong thing a kitchen ticket can say.
    renderCard({ ticket: { ...ticket(), items: [] } });
    expect(screen.getByText("Loading items…")).toBeTruthy();
  });
});

describe("ticket actions", () => {
  it("bumps the order it is showing", () => {
    const { onBump } = renderCard();
    fireEvent.press(screen.getByText("Bump · Ready"));
    expect(onBump).toHaveBeenCalledWith("j57abc123xyz789ef");
  });

  it("prints the whole ticket, not just the order", () => {
    // The chit needs the line items; passing the bare order would print a
    // header with nothing under it.
    const { onPrint } = renderCard();
    fireEvent.press(screen.getByText("Print"));
    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ items: expect.any(Array) }));
    expect(onPrint.mock.calls[0][0].items).toHaveLength(2);
  });

  it("hides Print when no printer is paired, rather than failing on tap", () => {
    renderCard({ canPrint: false });
    expect(screen.queryByText("Print")).toBeNull();
    expect(screen.getByText("Bump · Ready")).toBeTruthy();
  });
});

describe("striking items off", () => {
  it("strikes a line when the cook taps it, and only that line", () => {
    renderCard();
    const burger = screen.getByText("Burger");
    fireEvent.press(burger);

    expect(flatStyle(burger).textDecorationLine).toBe("line-through");
    // The whole dish goes: its variation and add-on with it.
    expect(flatStyle(screen.getByText("Large")).textDecorationLine).toBe("line-through");
    expect(flatStyle(screen.getByText("+ Extra Cheese")).textDecorationLine).toBe("line-through");
    expect(flatStyle(screen.getByText("Coke")).textDecorationLine).toBeUndefined();
  });

  it("un-strikes on a second tap, so a misfire is recoverable", () => {
    renderCard();
    const burger = screen.getByText("Burger");
    fireEvent.press(burger);
    fireEvent.press(burger);
    expect(flatStyle(screen.getByText("Burger")).textDecorationLine).toBeUndefined();
  });
});

/** Flatten a rendered node's style array into one object. */
function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const style = node.props.style;
  const parts = Array.isArray(style) ? style.flat(Infinity) : [style];
  return Object.assign({}, ...parts.filter(Boolean));
}

/**
 * Prep time — the chef's promise to the customer.
 *
 * This is the only control on the board whose effect is visible OUTSIDE the
 * kitchen: whatever is tapped here lands on a stranger's phone as "Ready by
 * 7:21 PM". That makes wrong minutes a customer-facing defect, not a display
 * bug, so what the chips send is pinned here.
 */
describe("prep time", () => {
  it("offers the quick taps while no time has been promised", () => {
    renderCard();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
  });

  it("sends the tapped minutes for this order", () => {
    const { onSetPrepTime } = renderCard();

    fireEvent.press(screen.getByText("15"));

    expect(onSetPrepTime).toHaveBeenCalledWith("j57abc123xyz789ef", 15);
  });

  it("shows the promised clock time once a time is set, not the raw minutes", () => {
    // A cook glancing at the rail needs the same answer the customer has.
    renderCard({
      ticket: ticket({
        order: {
          ...ticket().order,
          status: "preparing",
          prepMinutes: 15,
          promisedReadyAt: new Date(NOW + 15 * MINUTE).toISOString(),
        },
      }),
    });

    expect(screen.getByText(/Ready 12:15/)).toBeTruthy();
  });

  it("lets a cook running late push the promise back", () => {
    const { onSetPrepTime } = renderCard({
      ticket: ticket({
        order: {
          ...ticket().order,
          status: "preparing",
          prepMinutes: 15,
          promisedReadyAt: new Date(NOW + 15 * MINUTE).toISOString(),
        },
      }),
    });

    fireEvent.press(screen.getByText("+5"));

    expect(onSetPrepTime).toHaveBeenCalledWith("j57abc123xyz789ef", 20);
  });

  it("hides the control entirely when the backend cannot store a prep time", () => {
    // A Convex deployment on an older bundle has no setPrepTime mutation. A
    // chip that throws is worse than no chip.
    renderCard({ canSetPrepTime: false });

    expect(screen.queryByText("15")).toBeNull();
  });
});

describe("TicketCard table number", () => {
  it("names the table so the runner knows where the plate goes", () => {
    renderCard({
      ticket: ticket({
        order: { ...ticket().order, customerData: { table_number: "Table 7" } },
      }),
    });
    expect(screen.getByText("Table 7")).toBeTruthy();
  });
});

/**
 * Kitchen Confirm — the cook's "we have it", which the cashier hears about.
 * A ticket that rings must say so on the card (so a muted tablet is noticed)
 * and offer one big button that stops it.
 */
describe("kitchen confirm", () => {
  it("says a new ticket is ringing, and when it rang", () => {
    renderCard({ kitchenStatus: "ringing", rangAtMs: NOW - 2 * MINUTE });
    expect(screen.getByText(/RINGING/)).toBeTruthy();
    expect(screen.getByText(/Rang 11:58/)).toBeTruthy();
  });

  it("confirms the order it is showing", () => {
    const { onConfirm } = renderCard({ kitchenStatus: "ringing", rangAtMs: NOW });
    fireEvent.press(screen.getByRole("button", { name: "Confirm order" }));
    expect(onConfirm).toHaveBeenCalledWith("j57abc123xyz789ef");
  });

  it("offers Confirm on a backlog ticket without claiming it rang", () => {
    renderCard({ kitchenStatus: "waiting" });
    expect(screen.getByText(/NOT CONFIRMED YET/)).toBeTruthy();
    expect(screen.queryByText(/RINGING/)).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm order" })).toBeTruthy();
  });

  it("shows a confirmed ticket as confirmed, with no Confirm button left to tap", () => {
    renderCard({
      kitchenStatus: "confirmed",
      ticket: { ...ticket(), order: { ...ticket().order, status: "preparing" } },
    });
    expect(screen.getByText(/KITCHEN CONFIRMED/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm order" })).toBeNull();
  });

  it("still lets a cook bump an unconfirmed ticket straight to ready", () => {
    const { onBump } = renderCard({ kitchenStatus: "ringing", rangAtMs: NOW });
    fireEvent.press(screen.getByText("Bump · Ready"));
    expect(onBump).toHaveBeenCalledWith("j57abc123xyz789ef");
  });
});
