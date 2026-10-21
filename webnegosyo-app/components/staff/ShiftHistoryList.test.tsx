import React from "react";
import { render } from "@testing-library/react-native";

import { ShiftHistoryList } from "./ShiftHistoryList";
import type { ShiftRecord } from "../../lib/shift-service";

const NOW_ISO = "2026-09-19T10:00:00Z";
const NOW = Date.parse(NOW_ISO);

function shift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "s1",
    outletId: null,
    staffUserId: "ana",
    staffName: "Ana Cruz",
    status: "closed",
    openingFloat: 500,
    expectedCash: 1500,
    closingCount: 1450,
    note: null,
    drawerId: null,
    drawerName: null,
    isZeroBalance: false,
    closedByName: null,
    openedAt: "2026-09-19T01:00:00Z",
    closedAt: "2026-09-19T09:00:00Z",
    ...overrides,
  };
}

it("gives a counted drawer its verdict, its float and what was handed over", () => {
  const screen = render(<ShiftHistoryList shifts={[shift()]} nowMs={NOW} nowIso={NOW_ISO} />);
  expect(screen.getByText("Short ₱50.00")).toBeTruthy();
  expect(screen.getByText("₱1,000.00")).toBeTruthy(); // turnover, not the whole drawer
  expect(screen.getByText("Today")).toBeTruthy();
  expect(screen.getByText(/9:00 AM – 5:00 PM · 8h 0m/)).toBeTruthy();
});

it("does not report an uncounted drawer as balanced", () => {
  const screen = render(
    <ShiftHistoryList
      shifts={[shift({ expectedCash: null, closingCount: null })]}
      nowMs={NOW}
      nowIso={NOW_ISO}
    />,
  );
  expect(screen.getByText("Not counted")).toBeTruthy();
  expect(screen.queryByText("Balanced")).toBeNull();
});

it("says an open drawer is still open rather than inventing a close time", () => {
  const screen = render(
    <ShiftHistoryList
      shifts={[shift({ status: "open", closedAt: null, expectedCash: null, closingCount: null })]}
      nowMs={NOW}
      nowIso={NOW_ISO}
    />,
  );
  expect(screen.getByText("Open now")).toBeTruthy();
  expect(screen.getByText(/still open/)).toBeTruthy();
});

it("names the branch when the store has any", () => {
  const screen = render(
    <ShiftHistoryList
      shifts={[shift({ outletId: "north" })]}
      nowMs={NOW}
      nowIso={NOW_ISO}
      branchName={() => "North Branch"}
    />,
  );
  expect(screen.getByText(/North Branch/)).toBeTruthy();
});

it("explains an empty period instead of rendering nothing", () => {
  const screen = render(<ShiftHistoryList shifts={[]} nowMs={NOW} nowIso={NOW_ISO} />);
  expect(screen.getByText("No shifts in this period")).toBeTruthy();
});

it("names what each pay-out was for, so a drawer that bought ice is not read as light", () => {
  const screen = render(
    <ShiftHistoryList
      shifts={[
        shift({
          moves: { payIn: 0, payOut: 535.5, collected: 0 },
          payOuts: [
            { amount: 450, reason: "LPG", createdAt: "2026-09-19T02:00:00Z" },
            { amount: 85.5, reason: null, createdAt: "2026-09-19T03:00:00Z" },
          ],
        }),
      ]}
      nowMs={NOW}
      nowIso={NOW_ISO}
    />,
  );
  expect(screen.getByText(/₱535\.50 paid out/)).toBeTruthy();
  expect(screen.getByText("Paid out for: LPG ₱450.00 · No reason given ₱85.50")).toBeTruthy();
});
