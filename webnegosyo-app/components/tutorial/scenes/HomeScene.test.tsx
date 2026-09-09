/**
 * Home is where the tour's order arrives on its own — the merchant waits,
 * the queue chimes, the card lands. Pins that nothing is there before the
 * delay, the real card is there after it, and tapping it is the step.
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
    render(<HomeScene phase="views" tried={false} onTried={jest.fn()} />);
    expect(screen.getByText("Maria's Kitchen")).toBeTruthy();
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

  it("switches the bar to the Register view from the view chip", () => {
    const onTried = jest.fn();
    render(<HomeScene phase="views" tried={false} onTried={onTried} />);

    fireEvent.press(screen.getByLabelText("Current view: Operations. Change view"));
    expect(screen.getByText("Switch view")).toBeTruthy();
    fireEvent.press(screen.getByText("POS"));

    expect(onTried).toHaveBeenCalledTimes(1);
  });
});
