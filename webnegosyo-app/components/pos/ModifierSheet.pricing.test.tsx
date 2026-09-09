/**
 * The option picker under per-order-type pricing.
 *
 * The sheet is where the cashier reads what an add-on costs before the line
 * exists, so it is the one place a marked-up modifier could be shown at the
 * store price and then charged at the channel price — or the reverse. Every
 * assertion is on what the cashier sees or what the sheet hands the cart.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ModifierSheet } from "./ModifierSheet";
import type { ModifierGroup } from "../../lib/modifier-groups";
import type { OrderTypePricing } from "../../lib/order-type-pricing";
import type { PosCartSelection } from "../../lib/pos-cart";

const GRAB_20: OrderTypePricing = {
  orderTypeId: "ot-grab",
  markupPercent: 20,
  itemPrices: {},
};

const SHOTS: ModifierGroup = {
  id: "g-shots",
  name: "Shots",
  display_order: 0,
  min_select: 0,
  max_select: null,
  options: [
    { id: "o-extra", name: "Extra shot", price_modifier: 10, display_order: 0 },
  ],
};

function renderSheet(pricing: OrderTypePricing | null, onConfirm = jest.fn()) {
  render(
    <ModifierSheet
      visible
      itemName="Latte"
      // The caller has already priced the base for the channel (₱100 at 20%).
      basePrice={pricing ? 120 : 100}
      groups={[SHOTS]}
      pricing={pricing}
      onCancel={() => {}}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("ModifierSheet under a channel markup", () => {
  it("labels the add-on at its marked-up price", () => {
    renderSheet(GRAB_20);
    expect(screen.getByText("+₱12.00")).toBeTruthy();
    expect(screen.queryByText("+₱10.00")).toBeNull();
  });

  it("previews the line at base plus the marked-up modifier", () => {
    renderSheet(GRAB_20);
    fireEvent.press(screen.getByText(/Extra shot/));
    expect(screen.getByText("Add ₱132.00")).toBeTruthy();
  });

  it("hands the cart the marked-up modifier with its list figure kept", () => {
    const onConfirm = renderSheet(GRAB_20);
    fireEvent.press(screen.getByText(/Extra shot/));
    fireEvent.press(screen.getByText(/^Add /));

    const [selections] = onConfirm.mock.calls[0] as [PosCartSelection[], number];
    expect(selections).toEqual([
      expect.objectContaining({
        optionId: "o-extra",
        priceModifier: 12,
        listPriceModifier: 10,
      }),
    ]);
  });
});

describe("ModifierSheet with no channel pricing", () => {
  it("labels and charges the add-on at the store price", () => {
    const onConfirm = renderSheet(null);
    expect(screen.getByText("+₱10.00")).toBeTruthy();

    fireEvent.press(screen.getByText(/Extra shot/));
    expect(screen.getByText("Add ₱110.00")).toBeTruthy();
    fireEvent.press(screen.getByText(/^Add /));

    const [selections] = onConfirm.mock.calls[0] as [PosCartSelection[], number];
    expect(selections[0]).toEqual(
      expect.objectContaining({ priceModifier: 10, listPriceModifier: 10 }),
    );
  });
});
