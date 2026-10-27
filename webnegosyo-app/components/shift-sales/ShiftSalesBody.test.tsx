import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ShiftSalesBody, ShiftSalesSkeleton, type ShiftSalesBodyProps } from "./ShiftSalesBody";
import { sampleShiftSales } from "../../lib/cash/shift-sales-sample";
import type { ShiftSalesReport } from "../../lib/cash/shift-sales";
import { HIDDEN_TITLE, RECEIPTS_TRUNCATED_NOTE } from "../../lib/cash/shift-sales-view";

const NOW = Date.parse("2026-10-24T10:00:00.000Z");

function props(report: ShiftSalesReport, overrides: Partial<ShiftSalesBodyProps> = {}): ShiftSalesBodyProps {
  return {
    report,
    title: "Day shift",
    isOpen: true,
    isWide: false,
    lens: "store",
    drawer: { lens: null, pendingText: "Adding up…" },
    notice: null,
    ...overrides,
  };
}

function hiddenReport(): ShiftSalesReport {
  const sample = sampleShiftSales(NOW);
  return {
    ...sample,
    source: "server",
    hidden: true,
    summary: null,
    payments: null,
    orderTypes: null,
    channels: null,
    items: null,
    receipts: sample.receipts.map((r) => ({ ...r, totalCents: null })),
  };
}

describe("ShiftSalesBody", () => {
  it("leads with net sales this shift, the receipt range and what is still unpaid", () => {
    render(<ShiftSalesBody {...props(sampleShiftSales(NOW))} />);
    expect(screen.getByText("Net sales this shift")).toBeTruthy();
    expect(screen.getByTestId("shift-sales-net").props.accessibilityLabel).toMatch(/pesos/);
    expect(screen.getByTestId("shift-sales-range").props.children).toBe("#01 – #10 · 10 receipts");
    expect(screen.getByText("Still unpaid")).toBeTruthy();
    expect(screen.getByText("Paid by")).toBeTruthy();
    expect(screen.getByText("Order types")).toBeTruthy();
  });

  it("says a device count is a device count", () => {
    render(<ShiftSalesBody {...props({ ...sampleShiftSales(NOW), source: "device" })} />);
    expect(screen.getByText("Counted on this tablet")).toBeTruthy();
  });

  it("in blind count keeps the receipts and their count but shows no peso anywhere", () => {
    render(<ShiftSalesBody {...props(hiddenReport())} />);
    expect(screen.getByTestId("shift-sales-hidden")).toBeTruthy();
    expect(screen.getByText(HIDDEN_TITLE)).toBeTruthy();
    expect(screen.queryByTestId("shift-sales-net")).toBeNull();
    expect(screen.queryByText("Paid by")).toBeNull();
    expect(screen.getByText("#07")).toBeTruthy();
    expect(screen.getAllByText("Hidden").length).toBe(10);
    expect(screen.queryByText(/₱/)).toBeNull();
  });

  it("finds a receipt by number and opens it", () => {
    const onOpen = jest.fn();
    render(<ShiftSalesBody {...props(sampleShiftSales(NOW), { onOpenReceipt: onOpen })} />);
    fireEvent.changeText(screen.getByTestId("shift-sales-search"), "7");
    expect(screen.queryByText("#06")).toBeNull();
    fireEvent.press(screen.getByLabelText(/^Receipt #07/));
    expect(onOpen).toHaveBeenCalledWith("demo-shift-7");
  });

  it("names every receipt's status in words", () => {
    render(<ShiftSalesBody {...props(sampleShiftSales(NOW))} />);
    expect(screen.getAllByText("Paid").length).toBe(8);
    expect(screen.getByText("Void")).toBeTruthy();
    expect(screen.getByText("Unpaid")).toBeTruthy();
  });

  it("says when the receipt list was cut short", () => {
    render(<ShiftSalesBody {...props({ ...sampleShiftSales(NOW), receiptsTruncated: true })} />);
    expect(screen.getByText(RECEIPTS_TRUNCATED_NOTE)).toBeTruthy();
  });

  it("shows the cashier's own drawer on the My drawer lens, and words while it adds up", () => {
    render(<ShiftSalesBody {...props(sampleShiftSales(NOW), { lens: "drawer" })} />);
    expect(screen.getByText("Cash you took this shift")).toBeTruthy();
    expect(screen.getByText("Adding up…")).toBeTruthy();
    expect(screen.queryByTestId("shift-sales-hero")).toBeNull();
  });

  it("offers End shift & remit only when asked to", () => {
    const onEnd = jest.fn();
    const { rerender } = render(<ShiftSalesBody {...props(sampleShiftSales(NOW))} />);
    expect(screen.queryByText("End shift & remit")).toBeNull();
    rerender(<ShiftSalesBody {...props(sampleShiftSales(NOW), { onEndShift: onEnd })} />);
    fireEvent.press(screen.getByText("End shift & remit"));
    expect(onEnd).toHaveBeenCalled();
  });

  it("folds top items to five until asked", () => {
    const report = sampleShiftSales(NOW);
    const items = Array.from({ length: 7 }, (_, i) => ({ label: `Dish ${i + 1}`, quantity: 1, netCents: 1000 * (7 - i) }));
    render(<ShiftSalesBody {...props({ ...report, items })} />);
    expect(screen.queryByText("Dish 6")).toBeNull();
    fireEvent.press(screen.getByText("Show all 7"));
    expect(screen.getByText("Dish 6")).toBeTruthy();
  });

  it("lays the receipts beside the figures on a tablet", () => {
    render(<ShiftSalesBody {...props(sampleShiftSales(NOW), { isWide: true })} />);
    expect(screen.getByTestId("shift-sales-receipts")).toBeTruthy();
    expect(screen.getByTestId("shift-sales-hero")).toBeTruthy();
  });

  it("shows the notice when figures came from somewhere else", () => {
    render(<ShiftSalesBody {...props(sampleShiftSales(NOW), { notice: "Couldn't refresh." })} />);
    expect(screen.getByText("Couldn't refresh.")).toBeTruthy();
  });
});

describe("ShiftSalesSkeleton", () => {
  it("says it is adding up, never a ₱0", () => {
    render(<ShiftSalesSkeleton />);
    expect(screen.getByText("Adding up…")).toBeTruthy();
    expect(screen.queryByText(/₱/)).toBeNull();
  });
});
