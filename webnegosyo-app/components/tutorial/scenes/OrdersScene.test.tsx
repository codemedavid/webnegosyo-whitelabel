/**
 * The Orders simulation runs on the app's real OrderCard and filter bar, so
 * these pin what the tour promises: the same button label the real queue
 * shows, the status actually changing, the confirmation alert, the Ready
 * filter narrowing the list, and Cancel asking first.
 */

import "./jest-scene-mocks";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { OrdersScene } from "./OrdersScene";

const renderScene = (phase: string) => {
  const onTried = jest.fn();
  render(<OrdersScene phase={phase} tried={false} onTried={onTried} />);
  return onTried;
};

describe("OrdersScene", () => {
  it("confirms the pending order with the real card's button and offers to print", () => {
    const onTried = renderScene("confirm");
    expect(screen.getByText("Maria Santos")).toBeTruthy();

    fireEvent.press(screen.getByText("Mark as Confirmed"));

    expect(onTried).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Order Confirmed")).toBeTruthy();
    expect(screen.getByText("Open & print")).toBeTruthy();
    fireEvent.press(screen.getByText("Later"));
    expect(screen.queryByText("Order Confirmed")).toBeNull();
    expect(screen.getByText("Mark as Preparing")).toBeTruthy();
  });

  it("narrows the queue to Ready orders", () => {
    const onTried = renderScene("filter");
    expect(screen.getByText("Jun Reyes")).toBeTruthy();

    fireEvent.press(screen.getAllByText("Ready")[0]);

    expect(onTried).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Jun Reyes")).toBeNull();
    expect(screen.getByText("Ana Cruz")).toBeTruthy();
    expect(screen.getByText("Leo Tan")).toBeTruthy();
  });

  it("asks before cancelling and only counts the destructive choice", () => {
    const onTried = renderScene("cancel");

    fireEvent.press(screen.getAllByText("Cancel")[0]);
    expect(screen.getByText("Cancel this order?")).toBeTruthy();
    fireEvent.press(screen.getByText("Keep Order"));
    expect(onTried).not.toHaveBeenCalled();

    fireEvent.press(screen.getAllByText("Cancel")[0]);
    fireEvent.press(screen.getByText("Cancel Order"));
    expect(onTried).toHaveBeenCalledTimes(1);
  });
});
