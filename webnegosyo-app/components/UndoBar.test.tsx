import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { UndoBar } from "./UndoBar";

describe("UndoBar", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("counts down and commits when nobody taps Undo", () => {
    const onCommit = jest.fn();
    const onUndo = jest.fn();
    render(<UndoBar message="Approving ₱185 for Ana…" onUndo={onUndo} onCommit={onCommit} durationMs={4000} />);
    expect(screen.getByText("4", { includeHiddenElements: true })).toBeTruthy();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText("3", { includeHiddenElements: true })).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(3000));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("Undo stops the commit", () => {
    const onCommit = jest.fn();
    const onUndo = jest.fn();
    render(<UndoBar message="Approving ₱185 for Ana…" onUndo={onUndo} onCommit={onCommit} />);
    fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    act(() => jest.advanceTimersByTime(5000));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("is announced to a screen reader", () => {
    render(<UndoBar message="Approving ₱185 for Ana…" onUndo={jest.fn()} onCommit={jest.fn()} />);
    expect(screen.getByRole("alert", { name: "Approving ₱185 for Ana…" })).toBeTruthy();
  });
});
