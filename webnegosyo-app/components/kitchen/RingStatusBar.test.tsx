import React from "react";
import { render, screen } from "@testing-library/react-native";
import { RingStatusBar } from "./RingStatusBar";

describe("RingStatusBar", () => {
  it("says the sound is on where new orders really ring", () => {
    render(<RingStatusBar ringingCount={0} waitingCount={0} onTestSound={jest.fn()} />);
    expect(screen.getByText(/Sound on/)).toBeTruthy();
  });

  it("never promises a ring in the demo, where the board does not ring", () => {
    render(<RingStatusBar ringingCount={2} waitingCount={1} isDemo onTestSound={jest.fn()} />);
    expect(screen.queryByText(/Sound on/)).toBeNull();
    expect(screen.queryByText(/Ringing/)).toBeNull();
    expect(screen.getByText(/Sound off in demo/)).toBeTruthy();
  });
});
