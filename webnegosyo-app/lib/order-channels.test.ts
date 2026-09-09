/**
 * Where the orders came from.
 *
 * `getSalesAnalytics` only ever reported two channels — web and mobile — while
 * the register, the QR table handoff and phoned-in counter sales all landed in
 * `totalOrders`. A merchant running a busy till therefore saw, say, 90 orders
 * with 12 web and 4 mobile beside them and no account of the other 74. These
 * tests pin the full split, and the fallback a store on an older backend gets.
 */

import {
  ORDER_SOURCE_LABELS,
  buildOrderChannelRows,
  type OrderChannelRow,
} from "./order-channels";

describe("buildOrderChannelRows", () => {
  it("labels every known channel and ranks them by order count", () => {
    const rows = buildOrderChannelRows({
      totalOrders: 10,
      ordersByChannel: [
        { source: "web", count: 2, revenue: 200 },
        { source: "pos", count: 5, revenue: 900 },
        { source: "mobile", count: 1, revenue: 150 },
        { source: "qr_handoff", count: 2, revenue: 300 },
      ],
    });

    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ["Counter", 5],
      ["Online", 2],
      ["QR", 2],
      ["App", 1],
    ]);
  });

  it("reports each channel's share of all orders in the period", () => {
    const rows = buildOrderChannelRows({
      totalOrders: 4,
      ordersByChannel: [
        { source: "pos", count: 3, revenue: 300 },
        { source: "web", count: 1, revenue: 100 },
      ],
    });

    expect(rows.map((r) => r.share)).toEqual([0.75, 0.25]);
  });

  it("carries the revenue each channel took", () => {
    const rows = buildOrderChannelRows({
      totalOrders: 1,
      ordersByChannel: [{ source: "pos", count: 1, revenue: 450 }],
    });

    expect(rows[0].revenue).toBe(450);
  });

  it("names an unrecognised channel from its own key rather than hiding it", () => {
    const rows = buildOrderChannelRows({
      totalOrders: 1,
      ordersByChannel: [{ source: "kiosk_terminal", count: 1, revenue: 10 }],
    });

    expect(rows[0].label).toBe("Kiosk terminal");
  });

  it("groups orders that recorded no channel under Other", () => {
    const rows = buildOrderChannelRows({
      totalOrders: 1,
      ordersByChannel: [{ source: "", count: 1, revenue: 10 }],
    });

    expect(rows[0].label).toBe("Other");
  });

  it("drops channels with no orders in the period", () => {
    const rows = buildOrderChannelRows({
      totalOrders: 1,
      ordersByChannel: [
        { source: "pos", count: 1, revenue: 10 },
        { source: "mobile", count: 0, revenue: 0 },
      ],
    });

    expect(rows.map((r) => r.source)).toEqual(["pos"]);
  });

  it("returns nothing when the period had no orders", () => {
    expect(buildOrderChannelRows({ totalOrders: 0, ordersByChannel: [] })).toEqual([]);
  });

  describe("a store whose backend predates the channel split", () => {
    const stale = { totalOrders: 9, ordersBySource: { web: 5, mobile: 1 } };

    it("still shows the two channels that backend does report", () => {
      expect(buildOrderChannelRows(stale).map((r) => [r.label, r.count])).toEqual([
        ["Online", 5],
        ["App", 1],
      ]);
    });

    it("reports no revenue rather than inventing zero for it", () => {
      expect(buildOrderChannelRows(stale).every((r: OrderChannelRow) => r.revenue === null)).toBe(
        true
      );
    });
  });

  it("prefers the full split when the backend sends both shapes", () => {
    const rows = buildOrderChannelRows({
      totalOrders: 3,
      ordersBySource: { web: 1, mobile: 0 },
      ordersByChannel: [
        { source: "pos", count: 2, revenue: 200 },
        { source: "web", count: 1, revenue: 100 },
      ],
    });

    expect(rows.map((r) => r.source)).toEqual(["pos", "web"]);
  });
});

describe("ORDER_SOURCE_LABELS", () => {
  it("names the register Counter, matching the product analytics filter", () => {
    expect(ORDER_SOURCE_LABELS.pos).toBe("Counter");
  });
});
