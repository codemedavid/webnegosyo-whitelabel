import {
  ORDER_HISTORY_QUICK_PICK_LABELS,
  datedOrdersArgs,
  orderHistoryCapNotice,
  orderHistoryExportFileName,
  orderHistoryQuickPicks,
} from "./orders-history";
import { LEGACY_ORDER_PAGE, WINDOWED_ORDER_LIMIT } from "./report-window";
import type { CutoffSchedule } from "./business-day/trading-day";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function manila(iso: string): number {
  return Date.parse(`${iso}:00.000Z`) - MANILA_OFFSET_MS;
}

const FOUR_AM: CutoffSchedule = [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }];

describe("orderHistoryQuickPicks", () => {
  it("offers Today, Yesterday, Last 7 days and This month in that order", () => {
    const picks = orderHistoryQuickPicks(manila("2026-11-04T10:00"));

    expect(picks.map((pick) => pick.label)).toEqual(["Today", "Yesterday", "Last 7 days", "This month"]);
    expect(ORDER_HISTORY_QUICK_PICK_LABELS).toEqual(["Today", "Yesterday", "Last 7 days", "This month"]);
  });

  it("builds bounded day and range selections, never a daysBack preset", () => {
    // A preset goes out as now-minus-N×24h on an older backend; a picked day
    // is the store's real business day on every backend.
    const picks = orderHistoryQuickPicks(manila("2026-11-04T10:00"));

    expect(picks.map((pick) => pick.selection)).toEqual([
      { kind: "day", dayKey: "2026-11-04" },
      { kind: "day", dayKey: "2026-11-03" },
      { kind: "range", fromKey: "2026-10-29", toKey: "2026-11-04" },
      { kind: "range", fromKey: "2026-11-01", toKey: "2026-11-04" },
    ]);
  });

  it("follows the store's cutoff after midnight", () => {
    const picks = orderHistoryQuickPicks(manila("2026-11-05T01:30"), FOUR_AM);

    expect(picks[0].selection).toEqual({ kind: "day", dayKey: "2026-11-04" });
  });
});

describe("datedOrdersArgs", () => {
  const window = { startMs: 1000, endMs: 2000 };

  it("reads the whole window up to the windowed cap where the backend can bound", () => {
    expect(datedOrdersArgs(window, true)).toEqual({ startMs: 1000, endMs: 2000, limit: WINDOWED_ORDER_LIMIT });
  });

  it("still sends the window to an older backend, at the page it always read", () => {
    expect(datedOrdersArgs(window, false)).toEqual({ startMs: 1000, endMs: 2000, limit: LEGACY_ORDER_PAGE });
  });
});

describe("orderHistoryCapNotice", () => {
  it("says nothing while the read came back under its cap", () => {
    expect(orderHistoryCapNotice(9999, WINDOWED_ORDER_LIMIT)).toBeNull();
    expect(orderHistoryCapNotice(undefined, WINDOWED_ORDER_LIMIT)).toBeNull();
  });

  it("says the list is cut once the read reaches its cap", () => {
    expect(orderHistoryCapNotice(10000, WINDOWED_ORDER_LIMIT)).toBe(
      "Showing the first 10,000 orders (newest first). Pick fewer days to see the rest.",
    );
  });
});

describe("orderHistoryExportFileName", () => {
  it("names the picked business days, not the clock edges of the window", () => {
    // A 4 AM store's Nov 4 ends at 3:59 AM on the 5th; the file is still Nov 4.
    expect(orderHistoryExportFileName({ kind: "day", dayKey: "2026-11-04" })).toBe("orders_2026-11-04.csv");
    expect(orderHistoryExportFileName({ kind: "range", fromKey: "2026-10-29", toKey: "2026-11-04" })).toBe(
      "orders_2026-10-29_2026-11-04.csv",
    );
    expect(orderHistoryExportFileName({ kind: "range", fromKey: "2026-11-04", toKey: "2026-11-04" })).toBe("orders_2026-11-04.csv");
  });

  it("has no picked-day name for a preset", () => {
    expect(orderHistoryExportFileName({ kind: "preset", days: 7 })).toBeNull();
  });
});
