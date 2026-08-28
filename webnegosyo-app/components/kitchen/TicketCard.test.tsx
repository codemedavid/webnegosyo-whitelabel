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
import { render, screen, fireEvent } from "@testing-library/react-native";
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

function renderCard(props: Partial<React.ComponentProps<typeof TicketCard>> = {}) {
  const onBump = jest.fn();
  const onPrint = jest.fn();
  render(
    <TicketCard
      ticket={ticket()}
      nowMs={NOW}
      isNew={false}
      onBump={onBump}
      onPrint={onPrint}
      canPrint
      {...props}
    />,
  );
  return { onBump, onPrint };
}

describe("ticket content", () => {
  it("shows the short order reference the pass calls out", () => {
    renderCard();
    expect(screen.getByText("#89EF")).toBeTruthy();
  });

  it("lists every line with its quantity", () => {
    renderCard();
    expect(screen.getByText("2×")).toBeTruthy();
    expect(screen.getByText("Burger (Large)")).toBeTruthy();
    expect(screen.getByText("1×")).toBeTruthy();
    expect(screen.getByText("Coke")).toBeTruthy();
  });

  it("shows add-ons, so a cook does not plate a bare burger", () => {
    renderCard();
    expect(screen.getByText("+ Extra Cheese")).toBeTruthy();
  });

  it("shows the customer's note — the line that prevents an allergy incident", () => {
    renderCard();
    expect(screen.getByText("✱ no onions")).toBeTruthy();
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
    const burger = screen.getByText("Burger (Large)");
    fireEvent.press(burger);

    expect(flatStyle(burger).textDecorationLine).toBe("line-through");
    expect(flatStyle(screen.getByText("Coke")).textDecorationLine).toBeUndefined();
  });

  it("un-strikes on a second tap, so a misfire is recoverable", () => {
    renderCard();
    const burger = screen.getByText("Burger (Large)");
    fireEvent.press(burger);
    fireEvent.press(burger);
    expect(flatStyle(screen.getByText("Burger (Large)")).textDecorationLine).toBeUndefined();
  });
});

/** Flatten a rendered node's style array into one object. */
function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const style = node.props.style;
  const parts = Array.isArray(style) ? style.flat(Infinity) : [style];
  return Object.assign({}, ...parts.filter(Boolean));
}
