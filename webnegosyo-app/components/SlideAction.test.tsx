import React from "react";
import { AccessibilityInfo } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SlideAction } from "./SlideAction";

describe("SlideAction accessibility", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is one button a screen reader can activate without dragging", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
    const onComplete = jest.fn();
    render(<SlideAction label="Slide to approve ₱185" accessibilityLabel="Approve 185 pesos" onComplete={onComplete} />);
    const track = await screen.findByRole("button", { name: "Approve 185 pesos" });
    fireEvent(track, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("swaps the slide for a plain button while a screen reader is on", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    const onComplete = jest.fn();
    render(
      <SlideAction label="Slide to approve ₱185" fallbackLabel="Approve ₱185" accessibilityLabel="Approve 185 pesos" onComplete={onComplete} />,
    );
    await waitFor(() => expect(screen.getByText("Approve ₱185")).toBeTruthy());
    fireEvent.press(screen.getByRole("button", { name: "Approve 185 pesos" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("refuses the activate action while busy", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
    const onComplete = jest.fn();
    render(<SlideAction label="Slide to approve ₱185" onComplete={onComplete} isBusy />);
    const track = await screen.findByRole("button", { name: "Slide to approve ₱185" });
    fireEvent(track, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    expect(onComplete).not.toHaveBeenCalled();
  });
});
