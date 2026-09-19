import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";

import { ReportPeriodBar } from "./ReportPeriodBar";
import type { ReportSelection } from "../lib/report-window";

const NOW = Date.parse("2026-09-19T05:00:00.000Z"); // Fri 19 Sep 2026, Manila

function renderBar(selection: ReportSelection = { kind: "preset", days: 7 }) {
  const onChange = jest.fn();
  render(
    <ReportPeriodBar selection={selection} presets={[7, 14, 30]} nowMs={NOW} onChange={onChange} />
  );
  return { onChange };
}

describe("ReportPeriodBar", () => {
  it("offers the presets the screen shipped with", () => {
    renderBar();

    expect(screen.getByText("7 days")).toBeTruthy();
    expect(screen.getByText("14 days")).toBeTruthy();
    expect(screen.getByText("30 days")).toBeTruthy();
  });

  it("reports a preset tap as a preset selection", () => {
    // Presets must stay presets on the wire: they are the arm that keeps
    // working against a store running an older Convex bundle.
    const { onChange } = renderBar();

    fireEvent.press(screen.getByText("30 days"));

    expect(onChange).toHaveBeenCalledWith({ kind: "preset", days: 30 });
  });

  it("marks the active preset as selected", () => {
    renderBar({ kind: "preset", days: 14 });

    expect(screen.getByLabelText("14 days").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("7 days").props.accessibilityState.selected).toBe(false);
  });

  it("reports a picked day chosen through the calendar", () => {
    const { onChange } = renderBar();

    fireEvent.press(screen.getByLabelText("Pick dates"));
    fireEvent.press(screen.getByLabelText("2026-09-03"));
    fireEvent.press(screen.getByLabelText("Apply"));

    expect(onChange).toHaveBeenCalledWith({ kind: "day", dayKey: "2026-09-03" });
  });

  it("names the picked dates on the pill once chosen", () => {
    // The merchant must be able to see WHICH days they are looking at without
    // reopening the sheet.
    renderBar({ kind: "range", fromKey: "2026-09-01", toKey: "2026-09-14" });

    expect(screen.getByText("Sep 1 – Sep 14")).toBeTruthy();
    expect(screen.getByLabelText("Pick dates").props.accessibilityState.selected).toBe(true);
  });

  it("shows the plain label while a preset is active", () => {
    renderBar({ kind: "preset", days: 7 });

    expect(screen.getByText("Pick dates")).toBeTruthy();
    expect(screen.getByLabelText("Pick dates").props.accessibilityState.selected).toBe(false);
  });
});
