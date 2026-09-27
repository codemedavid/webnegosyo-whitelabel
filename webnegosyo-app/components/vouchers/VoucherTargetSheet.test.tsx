/**
 * Picking what a scoped voucher covers. The sheet holds a draft and only
 * hands it back on Done, so an accidental open and close changes nothing.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { VoucherTargetSheet } from "./VoucherTargetSheet";
import type { TargetOption } from "../../lib/vouchers/target-picker";

const OPTIONS: TargetOption[] = [
  { id: "p1", label: "Iced latte", group: "Drinks" },
  { id: "p2", label: "Iced mocha", group: "Drinks" },
  { id: "p3", label: "Adobo", group: "Mains" },
];

function renderSheet(selected: string[] = [], onDone = jest.fn(), onClose = jest.fn()) {
  render(
    <VoucherTargetSheet
      visible
      kind="products"
      options={OPTIONS}
      selected={selected}
      onClose={onClose}
      onDone={onDone}
    />,
  );
  return { onDone, onClose };
}

describe("VoucherTargetSheet", () => {
  it("returns the ticked products on Done", () => {
    const { onDone } = renderSheet();
    fireEvent.press(screen.getByLabelText("Iced latte"));
    fireEvent.press(screen.getByLabelText("Adobo"));
    fireEvent.press(screen.getByText("Use 2 selected"));
    expect(onDone).toHaveBeenCalledWith(["p1", "p3"]);
  });

  it("selects a whole category at once", () => {
    const { onDone } = renderSheet();
    fireEvent.press(screen.getByLabelText("Select all in Drinks"));
    fireEvent.press(screen.getByText("Use 2 selected"));
    expect(onDone).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("filters by name", () => {
    renderSheet();
    fireEvent.changeText(screen.getByLabelText("Search products"), "adobo");
    expect(screen.queryByLabelText("Iced latte")).toBeNull();
    expect(screen.getByLabelText("Adobo")).toBeTruthy();
  });

  it("closing without Done hands nothing back", () => {
    const { onDone, onClose } = renderSheet(["p1"]);
    fireEvent.press(screen.getByLabelText("Iced mocha"));
    fireEvent.press(screen.getByLabelText("Close without changing"));
    expect(onClose).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("offers to drop picks whose product was deleted", () => {
    const { onDone } = renderSheet(["p1", "gone"]);
    fireEvent.press(screen.getByText(/deleted from your menu/));
    fireEvent.press(screen.getByText("Use 1 selected"));
    expect(onDone).toHaveBeenCalledWith(["p1"]);
  });
});
