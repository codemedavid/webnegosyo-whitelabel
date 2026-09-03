// The Schedule screen's calendar is pure arithmetic over the same scheduled
// order list the agenda strip already builds. Everything takes an explicit
// `nowMs` and is built with local-time Date constructors so the suite is
// deterministic in any CI zone.
import {
  agendaDays,
  buildMonthGrid,
  filterByKind,
  loadByDay,
  monthCursorOf,
  monthTitle,
  nextLoadedDay,
  shiftMonth,
  summarizeDay,
} from "./schedule-calendar";

const atLocal = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime();

// Thu Sep 3 2026, 10:00 local.
const NOW = atLocal(2026, 8, 3, 10);

const scheduledOrder = (
  id: string,
  scheduledAtMs: number,
  extra: { presell?: string; status?: string; total?: number } = {},
) => ({
  _id: id,
  status: extra.status ?? "confirmed",
  total: extra.total ?? 100,
  scheduledAtMs,
  customerData: extra.presell ? { presell_date: extra.presell } : {},
});

describe("month cursor", () => {
  it("starts on the month that contains now", () => {
    expect(monthCursorOf(NOW)).toEqual({ year: 2026, month: 8 });
  });

  it("shifts across year boundaries in both directions", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 8 }, -13)).toEqual({ year: 2025, month: 7 });
  });

  it("titles the month in words, zone-stable", () => {
    expect(monthTitle({ year: 2026, month: 8 })).toBe("September 2026");
    expect(monthTitle({ year: 2027, month: 0 })).toBe("January 2027");
  });
});

describe("buildMonthGrid", () => {
  const grid = buildMonthGrid({ year: 2026, month: 8 }, NOW);

  it("lays out whole Sunday-first weeks, padded with neighbouring days", () => {
    // Sep 1 2026 is a Tuesday, so the first row starts on Sun Aug 30.
    expect(grid[0].map((c) => c.key)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    // Sep 30 is a Wednesday; the last row runs on into October.
    expect(grid[grid.length - 1].map((c) => c.key)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("marks padding, today, and days already gone", () => {
    const flat = grid.flat();
    const aug31 = flat.find((c) => c.key === "2026-08-31")!;
    const sep2 = flat.find((c) => c.key === "2026-09-02")!;
    const sep3 = flat.find((c) => c.key === "2026-09-03")!;
    const sep4 = flat.find((c) => c.key === "2026-09-04")!;
    expect(aug31).toMatchObject({ day: 31, isCurrentMonth: false, isPast: true });
    expect(sep2).toMatchObject({ day: 2, isCurrentMonth: true, isPast: true, isToday: false });
    expect(sep3).toMatchObject({ day: 3, isToday: true, isPast: false });
    expect(sep4).toMatchObject({ day: 4, isToday: false, isPast: false });
  });

  it("uses six rows only when the month needs them", () => {
    // Feb 2026 starts on a Sunday and has 28 days: exactly four rows.
    expect(buildMonthGrid({ year: 2026, month: 1 }, NOW)).toHaveLength(4);
    // Aug 2026 starts on a Saturday and has 31 days: six rows.
    expect(buildMonthGrid({ year: 2026, month: 7 }, NOW)).toHaveLength(6);
  });
});

describe("loadByDay", () => {
  const scheduled = [
    scheduledOrder("a", atLocal(2026, 8, 5, 12), { presell: "2026-09-05" }),
    scheduledOrder("b", atLocal(2026, 8, 5, 15)),
    scheduledOrder("c", atLocal(2026, 8, 3, 9)), // earlier today: overdue
    scheduledOrder("d", atLocal(2026, 8, 2, 18)), // yesterday: folds into today
    scheduledOrder("e", atLocal(2026, 8, 3, 17)),
  ];

  it("counts orders, pre-sold orders, and overdue ones per day", () => {
    const load = loadByDay(scheduled, NOW);
    expect(load.get("2026-09-05")).toEqual({ total: 2, presell: 1, overdue: 0 });
  });

  it("folds missed orders into today, exactly like the agenda strip", () => {
    const load = loadByDay(scheduled, NOW);
    expect(load.get("2026-09-03")).toEqual({ total: 3, presell: 0, overdue: 2 });
    expect(load.has("2026-09-02")).toBe(false);
  });
});

describe("filterByKind", () => {
  const scheduled = [
    scheduledOrder("a", atLocal(2026, 8, 5, 12), { presell: "2026-09-05" }),
    scheduledOrder("b", atLocal(2026, 8, 5, 15)),
  ];

  it("keeps everything for 'all', narrows to pre-sold or plain otherwise", () => {
    expect(filterByKind(scheduled, "all").map((o) => o._id)).toEqual(["a", "b"]);
    expect(filterByKind(scheduled, "presell").map((o) => o._id)).toEqual(["a"]);
    expect(filterByKind(scheduled, "plain").map((o) => o._id)).toEqual(["b"]);
  });
});

describe("summarizeDay", () => {
  it("totals the day's count, pre-sold count, and revenue", () => {
    const summary = summarizeDay([
      scheduledOrder("a", atLocal(2026, 8, 5, 12), { presell: "2026-09-05", total: 250 }),
      scheduledOrder("b", atLocal(2026, 8, 5, 15), { total: 1000 }),
    ]);
    expect(summary).toEqual({ count: 2, presell: 1, revenue: 1250 });
  });

  it("is zero for an empty day", () => {
    expect(summarizeDay([])).toEqual({ count: 0, presell: 0, revenue: 0 });
  });
});

describe("agendaDays", () => {
  it("lists today first (even empty), then every later day that has orders", () => {
    const scheduled = [
      scheduledOrder("a", atLocal(2026, 8, 5, 12)),
      scheduledOrder("b", atLocal(2026, 8, 9, 12)),
    ];
    const days = agendaDays(scheduled, NOW);
    expect(days.map((d) => d.key)).toEqual(["2026-09-03", "2026-09-05", "2026-09-09"]);
    expect(days[0]).toMatchObject({ label: "Today", orders: [] });
    expect(days[1].label).toBe("Sat, Sep 5");
    expect(days[1].orders.map((o) => o._id)).toEqual(["a"]);
  });
});

describe("nextLoadedDay", () => {
  const load = loadByDay(
    [
      scheduledOrder("a", atLocal(2026, 8, 5, 12)),
      scheduledOrder("b", atLocal(2026, 8, 9, 12)),
    ],
    NOW,
  );

  it("finds the first day with orders strictly after the given one", () => {
    expect(nextLoadedDay(load, "2026-09-03")).toBe("2026-09-05");
    expect(nextLoadedDay(load, "2026-09-05")).toBe("2026-09-09");
  });

  it("is null when nothing lies ahead", () => {
    expect(nextLoadedDay(load, "2026-09-09")).toBeNull();
  });
});
