/**
 * The shared button: named by its label, quiet while blocked, and a header
 * action that reads as one when a section needs one.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "./Button";
import { SectionHeader } from "./SectionHeader";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

describe("Button", () => {
  it("is a button named by its label", () => {
    const onPress = jest.fn();
    render(<Button label="Charge ₱250" onPress={onPress} />);

    fireEvent.press(screen.getByRole("button", { name: "Charge ₱250" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire while loading or disabled", () => {
    const onPress = jest.fn();
    render(
      <>
        <Button label="Save" onPress={onPress} isLoading />
        <Button label="Delete" onPress={onPress} tone="danger" disabled />
      </>,
    );

    // A blocked touchable has no press handler at all in RN, which is what
    // makes the state trustworthy: nothing to fire, not a guard that might slip.
    expect(screen.getByLabelText("Save")).toHaveProp("accessibilityState", {
      disabled: true,
      busy: true,
    });
    expect(screen.getByLabelText("Delete")).toHaveProp("accessibilityState", {
      disabled: true,
      busy: false,
    });
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("SectionHeader", () => {
  it("is a heading with one optional action", () => {
    const onAction = jest.fn();
    render(
      <SectionHeader
        title="Recent orders"
        hint="The last ten at this branch"
        actionLabel="See all"
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("header", { name: "Recent orders" })).toBeTruthy();
    expect(screen.getByText("The last ten at this branch")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "See all: Recent orders" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe("empty and error states", () => {
  it("says what is missing and offers the way out", () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        icon="search"
        title="Nothing matches"
        message="Try a shorter search."
        actionLabel="Clear search"
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Nothing matches")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the message-only call sites working", () => {
    render(<EmptyState message="No orders yet" />);
    expect(screen.getByText("No orders yet")).toBeTruthy();
  });

  it("names the failure and offers a retry, never 'Oops'", () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} />);

    expect(screen.queryByText("Oops")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
