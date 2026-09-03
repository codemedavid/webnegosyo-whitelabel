/**
 * The navigation row the Menu hub and Account screen are built from.
 *
 * What matters here is what a screen reader and a UI test can address: a row
 * is a button named by its title and hint, a current row says so instead of
 * offering a chevron, and a row with nothing to press is not a button.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ListRow } from "./ListRow";
import { IconButton } from "./IconButton";

describe("ListRow", () => {
  it("is a button named by its title and hint", () => {
    const onPress = jest.fn();
    render(<ListRow icon="orders" title="Orders" subtitle="Every order" onPress={onPress} />);

    fireEvent.press(screen.getByRole("button", { name: "Orders. Every order" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("marks the current place instead of offering to go there", () => {
    render(<ListRow icon="dashboard" title="Home" isActive onPress={() => {}} />);

    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByRole("button", { selected: true })).toBeTruthy();
  });

  it("is not a button when there is nothing to press", () => {
    render(<ListRow title="Signed in as" subtitle="owner@example.com" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
  });
});

describe("IconButton", () => {
  it("names its action for assistive tech and UI tests", () => {
    const onPress = jest.fn();
    render(<IconButton icon="qr" label="Scan QR" onPress={onPress} />);

    fireEvent.press(screen.getByLabelText("Scan QR"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire while disabled", () => {
    const onPress = jest.fn();
    render(<IconButton icon="export" label="Export" onPress={onPress} disabled />);

    fireEvent.press(screen.getByLabelText("Export"));

    expect(onPress).not.toHaveBeenCalled();
  });
});
