/**
 * The option picker and the ONE "sold out" switch.
 *
 * An option the merchant switched off — or a simple-stock option at zero —
 * is shown, labelled "Sold out", and cannot be picked. A required group with
 * nothing left makes the dish unaddable, with a reason. A recipe estimate is
 * only a hint ("2 left"); the cashier can still pick it.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ModifierSheet } from "./ModifierSheet";
import type { ModifierGroup } from "../../lib/modifier-groups";
import type { PosCartSelection } from "../../lib/pos-cart";

const MILK: ModifierGroup = {
  id: "g-milk",
  name: "Milk",
  display_order: 0,
  min_select: 1,
  max_select: 1,
  options: [
    { id: "o-whole", name: "Whole", price_modifier: 0, display_order: 0, is_available: false, is_default: true },
    { id: "o-oat", name: "Oat", price_modifier: 20, display_order: 1 },
    { id: "o-soy", name: "Soy", price_modifier: 20, display_order: 2, stock_mode: "simple", stock_qty: 0 },
  ],
};

function renderSheet(
  groups: ModifierGroup[],
  optionCeilings?: ReadonlyMap<string, number>,
  onConfirm = jest.fn(),
) {
  render(
    <ModifierSheet
      visible
      itemName="Latte"
      basePrice={100}
      groups={groups}
      optionCeilings={optionCeilings}
      onCancel={() => {}}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("ModifierSheet sold-out options", () => {
  it("labels switched-off and zero-stock options as sold out", () => {
    renderSheet([MILK]);
    expect(screen.getAllByText("Sold out")).toHaveLength(2);
  });

  it("never starts on a sold-out default, and will not pick a sold-out option", () => {
    const onConfirm = renderSheet([MILK]);

    // The default (Whole) is sold out, so the required single choice starts on
    // the first option still available — the web product page's rule.
    expect(screen.getByText("Add ₱120.00")).toBeTruthy();
    fireEvent.press(screen.getByText(/Soy/));
    expect(screen.getByText("Add ₱120.00")).toBeTruthy();

    fireEvent.press(screen.getByText(/^Add /));
    const [selections] = onConfirm.mock.calls[0] as [PosCartSelection[], number];
    expect(selections.map((s) => s.optionId)).toEqual(["o-oat"]);
  });

  it("starts an optional single choice empty when its default is sold out", () => {
    const onConfirm = renderSheet([{ ...MILK, min_select: 0 }]);
    fireEvent.press(screen.getByText(/^Add /));
    expect((onConfirm.mock.calls[0] as [PosCartSelection[], number])[0]).toEqual([]);
  });

  it("refuses the dish with a reason when a required group has nothing left", () => {
    const allGone: ModifierGroup = {
      ...MILK,
      options: MILK.options.map((option) => ({ ...option, is_available: false })),
    };
    const onConfirm = renderSheet([allGone]);

    expect(screen.getByText(/Every Milk choice is sold out/)).toBeTruthy();
    fireEvent.press(screen.getByText(/^Add /));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("hints a low recipe estimate on an option but still lets it be picked", () => {
    const onConfirm = renderSheet([MILK], new Map([["o-oat", 0]]));

    expect(screen.getByText("0 left")).toBeTruthy();
    fireEvent.press(screen.getByText(/Oat/));
    fireEvent.press(screen.getByText(/^Add /));
    expect(onConfirm).toHaveBeenCalled();
  });
});
