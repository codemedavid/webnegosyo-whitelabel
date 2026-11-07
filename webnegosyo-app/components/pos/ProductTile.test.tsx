/**
 * A register tile tells the cashier two different things, and must never mix
 * them up: "Sold out" is the merchant's switch (greyed, cannot be added), while
 * "N left" / "0 left" is the stock estimate (still tappable — it only warns).
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ProductTile } from "./ProductTile";

const base = {
  name: "Margherita",
  price: 200,
  imageUrl: null,
  quantity: 0,
  hasOptions: false,
};

describe("ProductTile", () => {
  it("shows a low estimate and stays tappable", () => {
    const onPress = jest.fn();
    render(<ProductTile {...base} stockHint={{ label: "3 left", isOut: false }} onPress={onPress} />);

    expect(screen.getByText("3 left")).toBeTruthy();
    fireEvent.press(screen.getByText("Margherita"));
    expect(onPress).toHaveBeenCalled();
  });

  it("shows 0 left on a dish still on sale, without calling it sold out", () => {
    render(<ProductTile {...base} stockHint={{ label: "0 left", isOut: true }} onPress={() => {}} />);

    expect(screen.getByText("0 left")).toBeTruthy();
    expect(screen.queryByText("Sold out")).toBeNull();
  });

  it("dims a tile at 0 left and keeps it tappable", () => {
    const onPress = jest.fn();
    render(<ProductTile {...base} stockHint={{ label: "0 left", isOut: true }} onPress={onPress} />);

    expect(screen.getByRole("button")).toHaveStyle({ opacity: 0.55 });
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalled();
  });

  it("does not dim a tile with stock left", () => {
    render(<ProductTile {...base} stockHint={{ label: "3 left", isOut: false }} onPress={() => {}} />);

    expect(screen.getByRole("button")).not.toHaveStyle({ opacity: 0.55 });
  });

  it("labels a switched-off dish sold out and says so to a screen reader", () => {
    render(<ProductTile {...base} isSoldOut stockHint={{ label: "2 left", isOut: false }} onPress={() => {}} />);

    expect(screen.getByText("Sold out")).toBeTruthy();
    // The estimate is irrelevant once the switch is off.
    expect(screen.queryByText("2 left")).toBeNull();
    expect(screen.getByLabelText(/Margherita, sold out/)).toBeTruthy();
  });

  it("a sold-out tile still opens its details, so a screen reader is not told it is disabled", () => {
    const onPress = jest.fn();
    render(<ProductTile {...base} isSoldOut onPress={onPress} />);

    const tile = screen.getByLabelText(/Margherita, sold out/);
    expect(tile.props.accessibilityState?.disabled).not.toBe(true);
    expect(tile.props.accessibilityHint).toBe("Double-tap for details");
    fireEvent.press(tile);
    expect(onPress).toHaveBeenCalled();
  });
});
