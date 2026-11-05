// The shift-sales lens (Cashier's sales · Store sales · My drawer), the Orders
// | Item summary switch and every period track are this control: VoiceOver
// must hear tabs with the chosen one selected.
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SegmentedControl } from "./SegmentedControl";

const LENSES = [
  { label: "Cashier's sales", value: "mine" },
  { label: "Store sales", value: "store" },
  { label: "My drawer", value: "drawer" },
] as const;

describe("SegmentedControl", () => {
  it("is a tab list whose segments are tabs, the chosen one selected", () => {
    const onChange = jest.fn();
    render(<SegmentedControl options={LENSES} value="mine" onChange={onChange} accessibilityPrefix="Show" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Show Cashier's sales" }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole("tab", { name: "Show Store sales" }).props.accessibilityState).toEqual({ selected: false });

    fireEvent.press(screen.getByRole("tab", { name: "Show My drawer" }));
    expect(onChange).toHaveBeenCalledWith("drawer");
  });
});
