/**
 * The tender simulation is where the tour shows money, so it must add up:
 * a ₱500 note against a ₱325 bill is ₱175 change, and the swipe stays locked
 * until a method is chosen.
 */

import "./jest-scene-mocks";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TenderScene } from "./TenderScene";

describe("TenderScene", () => {
  it("works out the change once a quick amount covers the bill", () => {
    const onTried = jest.fn();
    render(<TenderScene phase="tender" tried={false} onTried={onTried} />);

    expect(screen.getByText("Pick a payment method")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Cash"));
    expect(screen.getByText("—")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("₱500"));

    expect(screen.getByText("₱175.00")).toBeTruthy();
    expect(onTried).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Swipe to complete ₱325.00")).toBeTruthy();
  });

  it("does not report the step done for cash that falls short", () => {
    const onTried = jest.fn();
    render(<TenderScene phase="tender" tried={false} onTried={onTried} />);

    fireEvent.press(screen.getByLabelText("Cash"));
    fireEvent.changeText(screen.getByPlaceholderText("0.00"), "300");

    expect(onTried).not.toHaveBeenCalled();
    expect(screen.getByText("₱0.00")).toBeTruthy();
  });
});
