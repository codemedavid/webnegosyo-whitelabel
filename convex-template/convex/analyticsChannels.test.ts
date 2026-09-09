/**
 * The channel split behind `getSalesAnalytics`.
 *
 * That query reported `ordersBySource: { web, mobile }` and nothing else, so a
 * store taking most of its orders at the register saw those orders counted in
 * the total and attributed to nowhere. Extracted here so the grouping has a
 * test at all — the query handler itself needs a live deployment to run.
 */

import { summarizeOrderChannels } from "./analyticsChannels";

const order = (source: string | undefined, total = 100, status = "delivered") => ({
  source,
  total,
  status,
});

describe("summarizeOrderChannels", () => {
  it("counts every channel the orders came from, busiest first", () => {
    expect(
      summarizeOrderChannels([
        order("web"),
        order("pos"),
        order("pos"),
        order("qr_handoff"),
      ])
    ).toEqual([
      { source: "pos", count: 2, revenue: 200 },
      { source: "web", count: 1, revenue: 100 },
      { source: "qr_handoff", count: 1, revenue: 100 },
    ]);
  });

  it("counts a cancelled order but keeps its money out of the channel's revenue", () => {
    expect(summarizeOrderChannels([order("pos", 500, "cancelled"), order("pos", 100)])).toEqual([
      { source: "pos", count: 2, revenue: 100 },
    ]);
  });

  it("files an order with no recorded channel under an empty key", () => {
    expect(summarizeOrderChannels([order(undefined)])).toEqual([
      { source: "", count: 1, revenue: 100 },
    ]);
  });

  it("returns nothing for a period with no orders", () => {
    expect(summarizeOrderChannels([])).toEqual([]);
  });
});
