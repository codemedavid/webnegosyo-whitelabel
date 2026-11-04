import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ItemSummaryPanel } from "./ItemSummaryPanel";
import { ITEM_SUMMARY_PLATFORM_ONLY_MESSAGE, type ItemSummary } from "../../lib/reports/item-summary";

const SUMMARY: ItemSummary = {
  orders: 42,
  netCents: 1250000,
  itemsNetCents: 1250000,
  quantity: 71,
  ordersWithoutLines: 1,
  ordersLinesMismatch: 0,
  rows: [
    { key: "id:a", label: "Pork Sisig", quantity: 20, orders: 18, netCents: 700000, isUnrecorded: false },
    { key: "id:b", label: "Iced Latte", quantity: 51, orders: 30, netCents: 535000, isUnrecorded: false },
    { key: "unrecorded", label: "Items not recorded", quantity: 0, orders: 1, netCents: 15000, isUnrecorded: true },
  ],
};

function renderPanel(props: Partial<React.ComponentProps<typeof ItemSummaryPanel>>) {
  const handlers = { onRetry: jest.fn(), onPrint: jest.fn(), onShare: jest.fn() };
  render(
    <ItemSummaryPanel state={{ kind: "loading" }} periodLabel="Today" isPrinting={false} {...handlers} {...props} />,
  );
  return handlers;
}

describe("ItemSummaryPanel", () => {
  it("shows a skeleton while adding up, never ₱0", () => {
    renderPanel({ state: { kind: "loading" } });

    expect(screen.getByLabelText("Adding up the items sold")).toBeTruthy();
    expect(screen.queryByText("₱0.00")).toBeNull();
  });

  it("says why it failed and retries", () => {
    const { onRetry } = renderPanel({ state: { kind: "error", message: "The item summary couldn’t load." } });

    expect(screen.getByText("The item summary couldn’t load.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("explains itself on stores whose orders are not on the platform", () => {
    renderPanel({ state: { kind: "unavailable" } });

    expect(screen.getByText(ITEM_SUMMARY_PLATFORM_ONLY_MESSAGE)).toBeTruthy();
    expect(screen.queryByLabelText("Print")).toBeNull();
  });

  it("says there were no sales and offers nothing to print", () => {
    renderPanel({
      state: { kind: "ready", summary: { ...SUMMARY, orders: 0, netCents: 0, itemsNetCents: 0, quantity: 0, ordersWithoutLines: 0, rows: [] } },
    });

    expect(screen.getByText("No sales in this period")).toBeTruthy();
    expect(screen.queryByLabelText("Print")).toBeNull();
  });

  it("lists each dish with its quantity and net sales, and totals with net sales", () => {
    renderPanel({ state: { kind: "ready", summary: SUMMARY } });

    expect(screen.getByText("Pork Sisig")).toBeTruthy();
    expect(screen.getByText("₱7,000.00")).toBeTruthy();
    expect(screen.getByText("Orders saved without their dishes")).toBeTruthy();
    expect(screen.getByTestId("item-summary-total").props.accessibilityLabel).toBe("Total: 71 sold, net sales ₱12,500.00");
    expect(screen.getByText("42 orders · Today")).toBeTruthy();
  });

  it("shows the coverage note above the list", () => {
    renderPanel({ state: { kind: "ready", summary: SUMMARY } });

    expect(screen.getByText(/1 order was saved without its dishes/)).toBeTruthy();
  });

  it("prints and shares the summary", () => {
    const { onPrint, onShare } = renderPanel({ state: { kind: "ready", summary: SUMMARY } });

    fireEvent.press(screen.getByLabelText("Print"));
    fireEvent.press(screen.getByLabelText("Share"));

    expect(onPrint).toHaveBeenCalled();
    expect(onShare).toHaveBeenCalled();
  });
});
