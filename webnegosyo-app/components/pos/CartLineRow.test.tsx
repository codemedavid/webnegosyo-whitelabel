/**
 * One line of the running sale. On a tablet's side panel the column is narrow,
 * so a dish name, its note and the −/+ stepper in one row cut the name to
 * "Founder'…" and the note to "Less sugar, Ex…". The panel puts the stepper
 * under the name and lets the name and note wrap to two lines.
 */

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { CartLineRow } from "./CartLineRow";
import { addLine, type PosCartLine } from "../../lib/pos-cart";

function line(note?: string): PosCartLine {
  return addLine([], {
    menuItemId: "m-latte",
    name: "Founder's Latte",
    basePrice: 89,
    quantity: 1,
    selections: [],
    ...(note ? { note } : {}),
  })[0];
}

function renderRow(isPanel: boolean, note?: string) {
  const onChangeQty = jest.fn();
  const onOpenNote = jest.fn();
  const row = line(note);
  render(<CartLineRow line={row} isPanel={isPanel} onChangeQty={onChangeQty} onOpenNote={onOpenNote} />);
  return { row, onChangeQty, onOpenNote };
}

describe("a cart line", () => {
  it("lets the name and the note wrap to two lines", () => {
    renderRow(true, "Less sugar, Extra hot");
    expect(screen.getByText("Founder's Latte").props.numberOfLines).toBe(2);
    expect(screen.getByText("Less sugar, Extra hot").props.numberOfLines).toBe(2);
  });

  it("on the panel puts the stepper on its own row under the name", () => {
    renderRow(true, "Less sugar");
    const top = screen.getByTestId("cart-line-top");
    // Name, note and price share the top row; the stepper is not in it.
    expect(within(top).getByText("Founder's Latte")).toBeTruthy();
    expect(within(top).getByText("₱89.00")).toBeTruthy();
    expect(within(top).queryByLabelText("Increase Founder's Latte")).toBeNull();
    expect(within(screen.getByTestId("cart-line-stepper")).getByLabelText("Increase Founder's Latte")).toBeTruthy();
  });

  it("on a phone keeps the one-row line", () => {
    renderRow(false);
    expect(screen.queryByTestId("cart-line-top")).toBeNull();
    expect(screen.getByTestId("cart-line-stepper")).toBeTruthy();
  });

  it("announces the note area and the stepper as buttons with labels", () => {
    const { row, onChangeQty, onOpenNote } = renderRow(true);

    const note = screen.getByRole("button", { name: "Founder's Latte. Add a note for the kitchen" });
    fireEvent.press(note);
    expect(onOpenNote).toHaveBeenCalledWith(row.key);

    fireEvent.press(screen.getByRole("button", { name: "Increase Founder's Latte" }));
    fireEvent.press(screen.getByRole("button", { name: "Decrease Founder's Latte" }));
    expect(onChangeQty).toHaveBeenNthCalledWith(1, row.key, 2);
    expect(onChangeQty).toHaveBeenNthCalledWith(2, row.key, 0);
  });

  it("is read-only without a note handler", () => {
    const row = line("Spicy");
    render(<CartLineRow line={row} isPanel={false} onChangeQty={() => {}} />);
    expect(screen.getByText("Spicy")).toBeTruthy();
    expect(screen.queryByText("+ Note")).toBeNull();
    expect(screen.queryByRole("button", { name: /note/ })).toBeNull();
  });
});
