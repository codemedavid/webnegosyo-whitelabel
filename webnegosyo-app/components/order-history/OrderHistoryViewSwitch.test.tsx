import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { OrderHistoryViewSwitch } from "./OrderHistoryViewSwitch";

const OWNER = { role: "admin", isOwner: true, permissions: null };
const CASHIER = { role: "staff", isOwner: false, permissions: ["orders", "pos"] };

describe("OrderHistoryViewSwitch", () => {
  it("shows no summary toggle at all to an account holding only orders", () => {
    // Owner decision: cashiers never see whole-store sales, and are not teased with a locked tab.
    render(<OrderHistoryViewSwitch holder={CASHIER} route="platform" isDated view="orders" onChange={jest.fn()} />);

    expect(screen.queryByLabelText("Show Item summary")).toBeNull();
    expect(screen.queryByLabelText("Show Orders")).toBeNull();
  });

  it("shows no toggle on the live queue", () => {
    render(<OrderHistoryViewSwitch holder={OWNER} route="platform" isDated={false} view="orders" onChange={jest.fn()} />);

    expect(screen.queryByLabelText("Show Item summary")).toBeNull();
  });

  it("offers Orders | Item summary to the owner once dates are picked", () => {
    const onChange = jest.fn();
    render(<OrderHistoryViewSwitch holder={OWNER} route="platform" isDated view="orders" onChange={onChange} />);

    expect(screen.getByLabelText("Show Orders").props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText("Show Item summary"));
    expect(onChange).toHaveBeenCalledWith("summary");
  });

  it("draws no toggle on a Convex store, where the summary has nothing to show", () => {
    render(<OrderHistoryViewSwitch holder={OWNER} route="convex" isDated view="orders" onChange={jest.fn()} />);

    expect(screen.queryByLabelText("Show Item summary")).toBeNull();
    expect(screen.queryByText("Orders")).toBeNull();
  });
});
