/**
 * The tablet arrangement of the running sale.
 *
 * The register is one component in two shapes (lib/pos-layout.ts picks which),
 * and the risk in that is a shape that quietly drops something: a panel that
 * never opens its lines, hides half the order-type chips off a narrow edge, or
 * loses the Charge total. Every assertion here is about what the cashier can
 * still see and still reach once the sale moves from the bottom of a phone to
 * a column down the side of a tablet.
 *
 * Nothing is mocked — the totals come from the real `cartTotals` engine.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CartSheet } from "./CartSheet";
import { addLine, cartTotals, type PosCartLine } from "../../lib/pos-cart";
import type { PosOrderType } from "../../lib/pos-catalog";

const SERVICE_CHARGE = { type: "percentage", value: 10 } as const;

/** ₱300 of coffee: 2 × ₱150. */
function counterSale(): PosCartLine[] {
  return addLine([], {
    menuItemId: "m-latte",
    name: "Latte",
    basePrice: 150,
    quantity: 2,
    selections: [],
  });
}

const ORDER_TYPES: PosOrderType[] = [
  { id: "t-dinein", name: "Dine in", type: "dine_in", serviceCharge: SERVICE_CHARGE },
  { id: "t-takeout", name: "Take out", type: "takeout", serviceCharge: null },
  { id: "t-grab", name: "GrabFood", type: "other", serviceCharge: null },
  { id: "t-panda", name: "foodpanda", type: "other", serviceCharge: null },
] as unknown as PosOrderType[];

function renderPanel(overrides: Partial<React.ComponentProps<typeof CartSheet>> = {}) {
  const lines = counterSale();
  render(
    <CartSheet
      variant="panel"
      lines={lines}
      totals={cartTotals(lines, SERVICE_CHARGE)}
      orderTypes={ORDER_TYPES}
      orderTypeId="t-dinein"
      // The screen never expands a panel; it must open itself.
      isExpanded={false}
      onToggle={() => {}}
      onSelectOrderType={() => {}}
      onChangeQty={() => {}}
      onClear={() => {}}
      onCharge={() => {}}
      onAddDiscount={() => {}}
      {...overrides}
    />,
  );
}

describe("the sale panel", () => {
  it("shows its lines without being expanded first", () => {
    renderPanel();

    // On a phone these are behind the collapsed handle. A column has the
    // height to just show them, and hiding them there would be a regression.
    expect(screen.getByText("Latte")).toBeTruthy();
    expect(screen.getByText("Subtotal")).toBeTruthy();
    expect(screen.getByText("Service charge")).toBeTruthy();
  });

  it("still charges exactly what the sheet charges", () => {
    renderPanel();

    // ₱300 of coffee plus the 10% service charge — the same figure the phone
    // register prints for the same cart.
    expect(screen.getByText("Charge")).toBeTruthy();
    expect(screen.getByText("₱330.00")).toBeTruthy();
  });

  it("names itself, so the column is not an unlabelled slab of card", () => {
    renderPanel();

    expect(screen.getByText("Current sale")).toBeTruthy();
    expect(screen.getByText("2 items")).toBeTruthy();
  });

  it("keeps every order type reachable, not just the first few", () => {
    renderPanel();

    // Wrapped rather than scrolled sideways: choosing the wrong channel is a
    // mispriced sale, so none of them may sit off the edge of a narrow column.
    // `getAllBy`, not `getBy`: the active type also appears under the Charge
    // label, where it tells the cashier what channel they are about to ring.
    for (const type of ORDER_TYPES) {
      expect(screen.getAllByText(type.name).length).toBeGreaterThan(0);
    }
  });

  it("keeps the discount entry reachable", () => {
    const onAddDiscount = jest.fn();
    renderPanel({ onAddDiscount });

    fireEvent.press(screen.getByText("+ Add discount"));

    expect(onAddDiscount).toHaveBeenCalled();
  });

  it("can still be cleared", () => {
    const onClear = jest.fn();
    renderPanel({ onClear });

    fireEvent.press(screen.getByLabelText("Clear the sale"));

    expect(onClear).toHaveBeenCalled();
  });

  it("says what it is waiting for when the sale is empty", () => {
    renderPanel({ lines: [], totals: cartTotals([], SERVICE_CHARGE) });

    expect(screen.getByText("No items yet")).toBeTruthy();
    // …and offers nothing to clear.
    expect(screen.queryByLabelText("Clear the sale")).toBeNull();
  });

  it("does not offer a collapse handle — there is nothing to collapse", () => {
    const onToggle = jest.fn();
    renderPanel({ onToggle });

    expect(screen.queryByLabelText("Hide sale items")).toBeNull();
    expect(screen.queryByLabelText("Show sale items")).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("the bottom sheet, unchanged", () => {
  it("still opens collapsed and still hides its lines until asked", () => {
    const lines = counterSale();
    render(
      <CartSheet
        lines={lines}
        totals={cartTotals(lines, SERVICE_CHARGE)}
        orderTypes={ORDER_TYPES}
        orderTypeId="t-dinein"
        isExpanded={false}
        onToggle={() => {}}
        onSelectOrderType={() => {}}
        onChangeQty={() => {}}
        onClear={() => {}}
        onCharge={() => {}}
        onAddDiscount={() => {}}
      />,
    );

    expect(screen.getByLabelText("Show sale items")).toBeTruthy();
    expect(screen.queryByText("Subtotal")).toBeNull();
    expect(screen.queryByText("Current sale")).toBeNull();
  });
});
