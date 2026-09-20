/**
 * Home is where the tour's order arrives on its own — the merchant waits,
 * the queue chimes, the card lands. Pins that nothing is there before the
 * delay, the real card is there after it, and tapping it is the step; and
 * that the bar step really is a tap on the bar, not on a chip.
 */

import "./jest-scene-mocks";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../../../stores/auth-store", () => {
  const { create } = jest.requireActual("zustand");
  const useAuthStore = create(() => ({ tenantName: "Maria's Kitchen" }));
  return { useAuthStore };
});

import { HomeScene } from "./HomeScene";

describe("HomeScene", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("is set in the merchant's own store", () => {
    render(<HomeScene phase="bar" tried={false} onTried={jest.fn()} />);
    expect(screen.getByText("Maria's Kitchen")).toBeTruthy();
  });

  it("draws the fixed five-tab bar with no view chip", () => {
    render(<HomeScene phase="bar" tried={false} onTried={jest.fn()} />);
    for (const label of ["Home", "Orders", "POS", "Reports", "Manage"]) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByLabelText(/Current view/)).toBeNull();
  });

  it("lets a new order arrive, then opens it on tap", () => {
    const onTried = jest.fn();
    render(<HomeScene phase="arrive" tried={false} onTried={onTried} />);
    expect(screen.getByText("You're all caught up — no pending orders")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText("Maria Santos")).toBeTruthy();
    expect(screen.getByText("New order · Maria Santos")).toBeTruthy();
    fireEvent.press(screen.getByText("Maria Santos"));
    expect(onTried).toHaveBeenCalledTimes(1);
  });

  it("opens the register from the POS tab on the bar", () => {
    const onTried = jest.fn();
    render(<HomeScene phase="bar" tried={false} onTried={onTried} />);

    // The spotlight re-draws the bar over the frame's, so two POS tabs exist.
    // The overlay sits inside the frame body, ahead of the frame's own bar in
    // tree order, and it is the tappable one.
    fireEvent.press(screen.getAllByLabelText("POS")[0]);

    expect(onTried).toHaveBeenCalledTimes(1);
  });

  it("opens Manage from the bar", () => {
    const onTried = jest.fn();
    render(<HomeScene phase="menu" tried={false} onTried={onTried} />);

    fireEvent.press(screen.getAllByLabelText("Manage")[0]);

    expect(onTried).toHaveBeenCalledTimes(1);
  });
});
