// The scheduled-orders agenda is pure selection and grouping over the same
// order page every other operations screen reads. All time math takes an
// explicit `nowMs` so the suite is deterministic and timezone-stable: inputs
// are built with local-time Date constructors, never hard-coded UTC strings.
import {
  ACTIVE_SCHEDULED_STATUSES,
  buildDateStrip,
  formatScheduledFor,
  getScheduleBand,
  getScheduledISO,
  getScheduledLabel,
  groupByTime,
  ordersForDay,
  selectScheduledOrders,
  todayKey,
} from "./scheduled-orders";

/** Local-time helpers so expectations survive any CI timezone. */
const atLocal = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m, d, h, min);
const isoLocal = (y: number, m: number, d: number, h: number, min = 0) =>
  atLocal(y, m, d, h, min).toISOString();

// Thu Jun 18 2026, 10:00 in the runtime's local zone.
const NOW = atLocal(2026, 5, 18, 10, 0).getTime();

const order = (
  id: string,
  overrides: Partial<{
    status: string;
    scheduledFor: string | null;
    customerData: Record<string, unknown> | null;
  }> = {},
) => ({
  _id: id,
  status: "confirmed",
  scheduledFor: null,
  customerData: null,
  ...overrides,
});

describe("getScheduledISO", () => {
  it("prefers the top-level scheduledFor field", () => {
    const o = order("a", {
      scheduledFor: isoLocal(2026, 5, 18, 17, 30),
      customerData: { scheduled_for: isoLocal(2026, 5, 19, 9, 0) },
    });
    expect(getScheduledISO(o)).toBe(isoLocal(2026, 5, 18, 17, 30));
  });

  it("falls back to customerData.scheduled_for (web-created Convex orders)", () => {
    const o = order("a", {
      customerData: { scheduled_for: isoLocal(2026, 5, 18, 17, 30) },
    });
    expect(getScheduledISO(o)).toBe(isoLocal(2026, 5, 18, 17, 30));
  });

  it("returns null for ASAP orders and malformed payloads", () => {
    expect(getScheduledISO(order("a"))).toBeNull();
    expect(getScheduledISO(order("b", { customerData: { scheduled_for: 42 } }))).toBeNull();
    expect(getScheduledISO(null)).toBeNull();
    expect(getScheduledISO(undefined)).toBeNull();
  });
});

describe("getScheduledLabel", () => {
  it("prefers the customer-captured label over reformatting the ISO", () => {
    const o = order("a", {
      scheduledFor: isoLocal(2026, 5, 18, 17, 30),
      customerData: { scheduled_for_label: "Thu, Jun 18 · 5:30 PM" },
    });
    expect(getScheduledLabel(o)).toBe("Thu, Jun 18 · 5:30 PM");
  });

  it("formats the ISO when no label was captured", () => {
    const o = order("a", { scheduledFor: isoLocal(2026, 5, 18, 17, 0) });
    expect(getScheduledLabel(o)).toBe("Thu, Jun 18 · 5:00 PM");
  });

  it("returns null when the order carries no schedule at all", () => {
    expect(getScheduledLabel(order("a"))).toBeNull();
  });
});

describe("formatScheduledFor", () => {
  it("renders the shared platform label shape", () => {
    expect(formatScheduledFor(atLocal(2026, 5, 18, 17, 30))).toBe("Thu, Jun 18 · 5:30 PM");
    expect(formatScheduledFor(atLocal(2026, 5, 20, 0, 5))).toBe("Sat, Jun 20 · 12:05 AM");
  });

  it("returns an empty string for garbage input", () => {
    expect(formatScheduledFor("not-a-date")).toBe("");
  });
});

describe("selectScheduledOrders", () => {
  it("keeps only active orders that carry a valid schedule, sorted soonest first", () => {
    const orders = [
      order("later", { scheduledFor: isoLocal(2026, 5, 19, 9, 0) }),
      order("asap"),
      order("done", { status: "delivered", scheduledFor: isoLocal(2026, 5, 18, 12, 0) }),
      order("void", { status: "cancelled", scheduledFor: isoLocal(2026, 5, 18, 12, 0) }),
      order("soon", { scheduledFor: isoLocal(2026, 5, 18, 12, 0) }),
      order("bad", { scheduledFor: "not-a-date" }),
    ];
    const selected = selectScheduledOrders(orders);
    expect(selected.map((o) => o._id)).toEqual(["soon", "later"]);
    expect(selected[0].scheduledAtMs).toBe(atLocal(2026, 5, 18, 12, 0).getTime());
  });

  it("returns an empty list for undefined input", () => {
    expect(selectScheduledOrders(undefined)).toEqual([]);
  });

  it("covers every non-terminal status", () => {
    expect(ACTIVE_SCHEDULED_STATUSES).toEqual(["pending", "confirmed", "preparing", "ready"]);
  });
});

describe("getScheduleBand", () => {
  it("bands a passed time as overdue", () => {
    expect(getScheduleBand(NOW - 60_000, NOW)).toBe("overdue");
  });

  it("bands a time inside the due-soon window", () => {
    expect(getScheduleBand(NOW + 30 * 60_000, NOW)).toBe("due-soon");
  });

  it("bands everything beyond the window as upcoming", () => {
    expect(getScheduleBand(NOW + 3 * 60 * 60_000, NOW)).toBe("upcoming");
  });

  it("honors a custom due-soon window", () => {
    expect(getScheduleBand(NOW + 90 * 60_000, NOW, 120)).toBe("due-soon");
  });
});

describe("buildDateStrip", () => {
  it("groups by local day, folding missed past days into Today", () => {
    const scheduled = selectScheduledOrders([
      order("missed", { scheduledFor: isoLocal(2026, 5, 17, 17, 0) }),
      order("lunch", { scheduledFor: isoLocal(2026, 5, 18, 12, 0) }),
      order("dinner", { scheduledFor: isoLocal(2026, 5, 18, 18, 0) }),
      order("weekend", { scheduledFor: isoLocal(2026, 5, 20, 11, 0) }),
    ]);
    expect(buildDateStrip(scheduled, NOW)).toEqual([
      { key: todayKey(NOW), label: "Today", count: 3 },
      { key: "2026-06-20", label: "Sat, Jun 20", count: 1 },
    ]);
  });

  it("labels the day after today as Tomorrow", () => {
    const scheduled = selectScheduledOrders([
      order("a", { scheduledFor: isoLocal(2026, 5, 19, 9, 0) }),
    ]);
    expect(buildDateStrip(scheduled, NOW)).toEqual([
      { key: todayKey(NOW), label: "Today", count: 0 },
      { key: "2026-06-19", label: "Tomorrow", count: 1 },
    ]);
  });

  it("always offers Today so the strip is never empty", () => {
    expect(buildDateStrip([], NOW)).toEqual([{ key: todayKey(NOW), label: "Today", count: 0 }]);
  });
});

describe("ordersForDay", () => {
  const scheduled = selectScheduledOrders([
    order("missed", { scheduledFor: isoLocal(2026, 5, 17, 17, 0) }),
    order("dinner", { scheduledFor: isoLocal(2026, 5, 18, 18, 0) }),
    order("lunch", { scheduledFor: isoLocal(2026, 5, 18, 12, 0) }),
    order("weekend", { scheduledFor: isoLocal(2026, 5, 20, 11, 0) }),
  ]);

  it("returns overdue-from-earlier-days plus the day's own orders for Today", () => {
    expect(ordersForDay(scheduled, todayKey(NOW), NOW).map((o) => o._id)).toEqual([
      "missed",
      "lunch",
      "dinner",
    ]);
  });

  it("returns only the matching day's orders for a future day", () => {
    expect(ordersForDay(scheduled, "2026-06-20", NOW).map((o) => o._id)).toEqual(["weekend"]);
  });
});

describe("groupByTime", () => {
  it("groups same-minute orders under one time heading, in time order", () => {
    const scheduled = selectScheduledOrders([
      order("b", { scheduledFor: isoLocal(2026, 5, 18, 18, 0) }),
      order("a", { scheduledFor: isoLocal(2026, 5, 18, 12, 0) }),
      order("c", { scheduledFor: isoLocal(2026, 5, 18, 12, 0) }),
    ]);
    const groups = groupByTime(scheduled);
    expect(groups.map((g) => g.label)).toEqual(["12:00 PM", "6:00 PM"]);
    expect(groups[0].orders.map((o) => o._id)).toEqual(["a", "c"]);
  });
});
