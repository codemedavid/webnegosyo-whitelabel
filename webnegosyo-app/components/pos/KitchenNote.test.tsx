/**
 * Writing a note for the kitchen at the register.
 *
 * `special_instructions` was empty on every order row platform-wide because no
 * register screen let anyone type one. These pin the two ways in: tapping a
 * cart line, and the note box at the bottom of the option picker.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CartSheet } from "./CartSheet";
import { ModifierSheet } from "./ModifierSheet";
import { addLine, cartTotals, type PosCartLine } from "../../lib/pos-cart";
import type { ModifierGroup } from "../../lib/modifier-groups";

function cart(note?: string): PosCartLine[] {
  return addLine([], {
    menuItemId: "m-latte",
    name: "Latte",
    basePrice: 150,
    quantity: 1,
    selections: [],
    ...(note ? { note } : {}),
  });
}

function renderCart(lines: PosCartLine[], onEditNote?: (key: string, note: string) => void) {
  render(
    <CartSheet
      lines={lines}
      totals={cartTotals(lines)}
      orderTypes={[]}
      orderTypeId={null}
      isExpanded
      onToggle={() => {}}
      onSelectOrderType={() => {}}
      onChangeQty={() => {}}
      onEditNote={onEditNote}
      onClear={() => {}}
      onCharge={() => {}}
    />,
  );
}

describe("note on a cart line", () => {
  it("opens the kitchen note sheet when the line is tapped, and saves chips + text", () => {
    const onEditNote = jest.fn();
    const lines = cart();
    renderCart(lines, onEditNote);

    fireEvent.press(screen.getByLabelText("Latte. Add a note for the kitchen"));
    expect(screen.getByText("Note for kitchen")).toBeTruthy();

    fireEvent.press(screen.getByText("Less ice"));
    fireEvent.press(screen.getByText("No sugar"));
    fireEvent.press(screen.getByText("Save note"));

    expect(onEditNote).toHaveBeenCalledWith(lines[0].key, "Less ice, No sugar");
  });

  it("takes a typed note, trimmed", () => {
    const onEditNote = jest.fn();
    const lines = cart();
    renderCart(lines, onEditNote);

    fireEvent.press(screen.getByLabelText("Latte. Add a note for the kitchen"));
    fireEvent.changeText(screen.getByLabelText("Note for kitchen"), "  well done  ");
    fireEvent.press(screen.getByText("Save note"));

    expect(onEditNote).toHaveBeenCalledWith(lines[0].key, "well done");
  });

  it("shows a line's note under it and lets the cashier clear it", () => {
    const onEditNote = jest.fn();
    const lines = cart("No onion");
    renderCart(lines, onEditNote);

    expect(screen.getByText("No onion")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Latte, note No onion. Change the note"));
    fireEvent.press(screen.getByText("Clear note"));

    expect(onEditNote).toHaveBeenCalledWith(lines[0].key, "");
  });

  it("leaves lines read-only when no note handler is given", () => {
    renderCart(cart("Spicy"));

    expect(screen.getByText("Spicy")).toBeTruthy();
    expect(screen.queryByText("+ Note")).toBeNull();
    expect(screen.queryByLabelText(/Change the note/)).toBeNull();
  });
});

const SIZE: ModifierGroup = {
  id: "g-size",
  name: "Size",
  display_order: 0,
  min_select: 0,
  max_select: 1,
  options: [{ id: "o-large", name: "Large", price_modifier: 20, display_order: 0 }],
};

function renderPicker() {
  const onConfirm = jest.fn();
  render(
    <ModifierSheet
      visible
      itemName="Latte"
      basePrice={100}
      groups={[SIZE]}
      onCancel={() => {}}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("note in the option picker", () => {
  it("hands the note to the cart with the options", () => {
    const onConfirm = renderPicker();

    fireEvent.press(screen.getByText(/Large/));
    fireEvent.press(screen.getByText("Spicy"));
    fireEvent.press(screen.getByText(/^Add ₱/));

    expect(onConfirm).toHaveBeenCalledWith(
      [expect.objectContaining({ optionId: "o-large" })],
      1,
      "Spicy",
    );
  });

  it("sends no note when none was written", () => {
    const onConfirm = renderPicker();

    fireEvent.press(screen.getByText(/^Add ₱/));

    expect(onConfirm.mock.calls[0]).toHaveLength(2);
  });
});
