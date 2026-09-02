// A pre-sold order is a scheduled order that was sold against per-date stock.
// The date rides the order two ways — `customerData.presell_date` on every
// backend, and `items[].presellDate` on Convex v25+ — and both must be read,
// the same way the schedule itself is (see scheduled-orders.ts).
import { getPresellDate, isPresellOrder, presellCountsByDay, formatPresellDate } from "./presell-orders";

const atLocal = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).getTime();
// Thu Jun 18 2026, 10:00 local.
const NOW = atLocal(2026, 5, 18, 10);

describe("getPresellDate", () => {
  it("reads the date customer_data carries on every backend", () => {
    expect(getPresellDate({ customerData: { presell_date: "2026-06-20" } })).toBe("2026-06-20");
  });

  it("falls back to the first presell line on a Convex v25 order", () => {
    expect(
      getPresellDate({ customerData: {}, items: [{ presellDate: undefined }, { presellDate: "2026-06-21" }] }),
    ).toBe("2026-06-21");
  });

  it("is null for an ordinary scheduled order and for junk", () => {
    expect(getPresellDate({ customerData: { scheduled_for_label: "Sat" } })).toBeNull();
    expect(getPresellDate({ customerData: { presell_date: "soon" } })).toBeNull();
    expect(getPresellDate({ customerData: null })).toBeNull();
    expect(getPresellDate({})).toBeNull();
  });

  it("isPresellOrder mirrors it", () => {
    expect(isPresellOrder({ customerData: { presell_date: "2026-06-20" } })).toBe(true);
    expect(isPresellOrder({ customerData: {} })).toBe(false);
  });
});

describe("presellCountsByDay", () => {
  const scheduled = [
    { _id: "a", scheduledAtMs: atLocal(2026, 5, 20, 12), customerData: { presell_date: "2026-06-20" } },
    { _id: "b", scheduledAtMs: atLocal(2026, 5, 20, 15), customerData: { presell_date: "2026-06-20" } },
    { _id: "c", scheduledAtMs: atLocal(2026, 5, 20, 16), customerData: {} },
    { _id: "d", scheduledAtMs: atLocal(2026, 5, 17, 9), customerData: { presell_date: "2026-06-17" } },
  ];

  it("counts only pre-sold orders per scheduled day", () => {
    const counts = presellCountsByDay(scheduled, NOW);
    expect(counts.get("2026-06-20")).toBe(2);
  });

  it("folds a missed pre-order into today, like the date strip does", () => {
    const counts = presellCountsByDay(scheduled, NOW);
    expect(counts.get("2026-06-18")).toBe(1);
    expect(counts.has("2026-06-17")).toBe(false);
  });
});

describe("formatPresellDate", () => {
  it("is hand-rolled and zone-stable", () => {
    expect(formatPresellDate("2026-06-20")).toBe("Sat, Jun 20");
  });
});
