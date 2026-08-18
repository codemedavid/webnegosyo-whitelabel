/**
 * The export sheet every export entry point shares.
 *
 * Purely presentational: the screen owns the data and the share call, this
 * owns preset selection and the busy/coverage/error states. These tests pin
 * the contract the screens rely on — the chosen preset actually reaches
 * `onExport`, a busy export cannot be double-fired, and an incomplete export
 * says so instead of implying the file covers the whole range.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ExportSheet } from "./ExportSheet";

function renderSheet(overrides: Partial<React.ComponentProps<typeof ExportSheet>> = {}) {
  const props = {
    visible: true,
    title: "Export orders",
    isBusy: false,
    onExport: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<ExportSheet {...props} />);
  return props;
}

describe("ExportSheet", () => {
  it("shows the title and the four date presets", () => {
    renderSheet();

    expect(screen.getByText("Export orders")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("7 days")).toBeTruthy();
    expect(screen.getByText("30 days")).toBeTruthy();
    expect(screen.getByText("90 days")).toBeTruthy();
  });

  it("exports the default 7-day preset when nothing is tapped", () => {
    const props = renderSheet();

    fireEvent.press(screen.getByText("Export CSV"));

    expect(props.onExport).toHaveBeenCalledWith("7d");
  });

  it("exports the preset the merchant selected", () => {
    const props = renderSheet();

    fireEvent.press(screen.getByText("30 days"));
    fireEvent.press(screen.getByText("Export CSV"));

    expect(props.onExport).toHaveBeenCalledWith("30d");
  });

  it("does not fire while an export is already running", () => {
    const props = renderSheet({ isBusy: true });

    fireEvent.press(screen.getByText("Exporting…"));

    expect(props.onExport).not.toHaveBeenCalled();
  });

  it("shows the coverage note when the export is a truncated window", () => {
    renderSheet({ coverageNote: "Includes orders since 2026-08-14 only." });

    expect(screen.getByText("Includes orders since 2026-08-14 only.")).toBeTruthy();
  });

  it("shows an error message when the last export failed", () => {
    renderSheet({ errorMessage: "Sharing is not available on this device." });

    expect(screen.getByText("Sharing is not available on this device.")).toBeTruthy();
  });

  it("closes via the Cancel action", () => {
    const props = renderSheet();

    fireEvent.press(screen.getByText("Cancel"));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("renders nothing when not visible", () => {
    renderSheet({ visible: false });

    expect(screen.queryByText("Export CSV")).toBeNull();
  });
});
