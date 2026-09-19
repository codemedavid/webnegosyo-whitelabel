import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";

import { ReportRangePicker } from "./ReportRangePicker";
import type { ReportSelection } from "../lib/report-window";

const NOW = Date.parse("2026-09-19T05:00:00.000Z"); // Fri 19 Sep 2026, Manila

function renderPicker(overrides: Partial<React.ComponentProps<typeof ReportRangePicker>> = {}) {
  const props = {
    visible: true,
    selection: { kind: "preset", days: 7 } as ReportSelection,
    nowMs: NOW,
    onApply: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<ReportRangePicker {...props} />);
  return props;
}

describe("ReportRangePicker", () => {
  it("applies the day the merchant tapped", () => {
    // Arrange
    const props = renderPicker();

    // Act
    fireEvent.press(screen.getByLabelText("2026-09-03"));
    fireEvent.press(screen.getByLabelText("Apply"));

    // Assert
    expect(props.onApply).toHaveBeenCalledWith({ kind: "day", dayKey: "2026-09-03" });
  });

  it("will not apply a half-built range", () => {
    // One tap of a range is not a window anyone can be shown, so Apply must
    // stay inert rather than quietly applying a single day.
    const props = renderPicker();

    fireEvent.press(screen.getByText("Range"));
    fireEvent.press(screen.getByLabelText("2026-09-01"));
    fireEvent.press(screen.getByLabelText("Apply"));

    expect(props.onApply).not.toHaveBeenCalled();
    expect(screen.getByText("Tap the last day")).toBeTruthy();
    // Apply must also LOOK unavailable, not just silently do nothing.
    expect(screen.getByLabelText("Apply").props.accessibilityState.disabled).toBe(true);
  });

  it("applies a range once both ends are tapped", () => {
    const props = renderPicker();

    fireEvent.press(screen.getByText("Range"));
    fireEvent.press(screen.getByLabelText("2026-09-01"));
    fireEvent.press(screen.getByLabelText("2026-09-14"));
    fireEvent.press(screen.getByLabelText("Apply"));

    expect(props.onApply).toHaveBeenCalledWith({
      kind: "range",
      fromKey: "2026-09-01",
      toKey: "2026-09-14",
    });
  });

  it("shows what will be applied before the merchant commits", () => {
    renderPicker();

    fireEvent.press(screen.getByLabelText("2026-09-03"));

    expect(screen.getByText("Sep 3")).toBeTruthy();
  });

  it("opens on the selection the report is already showing", () => {
    renderPicker({ selection: { kind: "day", dayKey: "2026-09-03" } });

    expect(screen.getByText("Sep 3")).toBeTruthy();
  });

  it("does not let a future day be tapped", () => {
    const props = renderPicker();

    // Sep 30 is after today (Sep 19); the cell is disabled, so the press is a
    // no-op and Apply has nothing to fire with.
    const futureCell = screen.getByLabelText("2026-09-30");
    expect(futureCell.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(futureCell);
    fireEvent.press(screen.getByLabelText("Apply"));

    expect(props.onApply).not.toHaveBeenCalled();
  });
});
