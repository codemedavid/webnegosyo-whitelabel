/**
 * Today's Drawer on a busy store: the screen's newest-first page can stop
 * short of midnight, and every sale it drops is money the till holds but the
 * totals never see.
 */

import { idsBeyondPage, ordersSince, pageReachesBack } from "./drawer-day";

const order = (id: string, at: number) => ({ _id: id, _creationTime: at });
const DAY_START = 1_000;

describe("pageReachesBack", () => {
  it("is true for a page shorter than its limit — that is the whole history", () => {
    expect(pageReachesBack([order("a", 5_000)], 2, DAY_START)).toBe(true);
  });

  it("is true for a full page that already holds an order from before the day", () => {
    expect(pageReachesBack([order("a", 5_000), order("b", 500)], 2, DAY_START)).toBe(true);
  });

  it("is false for a full page that is all today — earlier sales fell off", () => {
    expect(pageReachesBack([order("a", 5_000), order("b", 2_000)], 2, DAY_START)).toBe(false);
  });
});

describe("ordersSince", () => {
  it("keeps only today's orders when the page covers the day", () => {
    // Arrange
    const page = [order("a", 5_000), order("b", 500)];

    // Act / Assert
    expect(ordersSince(page, undefined, DAY_START).map((o) => o._id)).toEqual(["a"]);
  });

  it("adds the morning the page dropped, newest first, without duplicates", () => {
    // Arrange — the day read overlaps the page and is staler than it.
    const page = [{ ...order("c", 4_000), total: 9 }, order("b", 3_000)];
    const dayRead = [{ ...order("c", 4_000), total: 1 }, order("b", 3_000), order("a", 1_500)];

    // Act
    const sales = ordersSince(page, dayRead, DAY_START);

    // Assert — the live page wins for an order both reads hold.
    expect(sales.map((o) => o._id)).toEqual(["c", "b", "a"]);
    expect(sales[0]).toMatchObject({ total: 9 });
  });
});

describe("idsBeyondPage", () => {
  it("names only the orders the page does not hold", () => {
    const page = [order("c", 4_000)];
    expect(idsBeyondPage(page, [order("c", 4_000), order("a", 1_500)])).toEqual(["a"]);
  });
});
