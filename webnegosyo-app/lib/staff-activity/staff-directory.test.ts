import {
  buildStaffDirectory,
  groupActivityByDay,
  summarizeTeam,
} from "./staff-directory";
import type { OrderActivityEvent } from "./activity";
import type { ShiftRecord } from "../shift-service";
import type { StaffMember } from "../staff-service";

const NOW = Date.parse("2026-09-19T10:00:00Z");
const WINDOW = { startMs: NOW - 7 * 86_400_000, endMs: NOW };

function member(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    userId: "ana",
    isOwner: false,
    outletId: null,
    permissions: ["pos"],
    displayName: "Ana Cruz",
    email: "ana@x.com",
    defaultTab: null,
    createdAt: "2026-01-05T00:00:00Z",
    ...overrides,
  };
}

function event(overrides: Partial<OrderActivityEvent> = {}): OrderActivityEvent {
  return {
    id: "e1",
    externalOrderId: "abcdef123456",
    event: "status_changed",
    status: "confirmed",
    source: "online",
    orderTotal: 250,
    actorUserId: "ana",
    actorName: "Ana Cruz",
    occurredAt: new Date(NOW - 3_600_000).toISOString(),
    ...overrides,
  };
}

function shift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "s1",
    outletId: null,
    staffUserId: "ana",
    staffName: "Ana Cruz",
    status: "closed",
    openingFloat: 500,
    expectedCash: 1500,
    closingCount: 1500,
    note: null,
    openedAt: new Date(NOW - 9 * 3_600_000).toISOString(),
    closedAt: new Date(NOW - 3_600_000).toISOString(),
    ...overrides,
  };
}

describe("buildStaffDirectory", () => {
  it("lists a member who has done nothing yet, with zeroed figures", () => {
    const [entry] = buildStaffDirectory({ members: [member()], events: [], shifts: [], window: WINDOW, nowMs: NOW });
    expect(entry.name).toBe("Ana Cruz");
    expect(entry.activity.posSales).toBe(0);
    expect(entry.shifts.count).toBe(0);
    expect(entry.lastActiveAt).toBeNull();
    expect(entry.isFormer).toBe(false);
  });

  it("carries each person their own orders, shifts and last-seen stamp", () => {
    const [entry] = buildStaffDirectory({
      members: [member()],
      events: [event(), event({ id: "p", event: "placed", status: "pending", source: "pos", orderTotal: 80 })],
      shifts: [shift(), shift({ id: "s2", staffUserId: "ben" })],
      window: WINDOW,
      nowMs: NOW,
    });
    expect(entry.activity.confirmed).toBe(1);
    expect(entry.activity.posSalesTotal).toBe(80);
    expect(entry.shifts.count).toBe(1);
    expect(entry.lastActiveAt).toBe(new Date(NOW - 3_600_000).toISOString());
  });

  it("puts whoever holds an open drawer at the front", () => {
    const entries = buildStaffDirectory({
      members: [member({ userId: "busy", displayName: "Busy" }), member()],
      events: [event({ actorUserId: "busy" }), event({ id: "e2", actorUserId: "busy", status: "delivered" })],
      shifts: [shift({ status: "open", closedAt: null, expectedCash: null, closingCount: null })],
      window: WINDOW,
      nowMs: NOW,
    });
    expect(entries.map((entry) => entry.userId)).toEqual(["ana", "busy"]);
    expect(entries[0].openShift).not.toBeNull();
  });

  it("keeps a removed account's history, flagged as former", () => {
    const entries = buildStaffDirectory({
      members: [member()],
      events: [event({ id: "gone", actorUserId: "ghost", actorName: "Gone Guy" })],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    });
    expect(entries.find((entry) => entry.userId === "ghost")).toMatchObject({
      name: "Gone Guy",
      isFormer: true,
    });
  });

  it("names an account with neither display name nor email", () => {
    const [entry] = buildStaffDirectory({
      members: [member({ displayName: null, email: null })],
      events: [],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    });
    expect(entry.name).toBe("Unnamed account");
  });
});

describe("summarizeTeam", () => {
  it("counts the roster, who is on now, and what the team handled", () => {
    const entries = buildStaffDirectory({
      members: [member(), member({ userId: "ben", displayName: "Ben" })],
      events: [
        event({ id: "p1", event: "placed", status: "pending", source: "pos", orderTotal: 120 }),
        event({ id: "c1", actorUserId: "ben" }),
        event({ id: "x1", actorUserId: "ben", status: "cancelled" }),
      ],
      shifts: [
        shift({ status: "open", closedAt: null, expectedCash: null, closingCount: null }),
        shift({ id: "s9", closingCount: 1480 }),
      ],
      window: WINDOW,
      nowMs: NOW,
    });
    const stats = summarizeTeam(entries);
    expect(stats.headcount).toBe(2);
    expect(stats.onShift).toBe(1);
    expect(stats.posSales).toBe(1);
    expect(stats.posSalesTotal).toBe(120);
    expect(stats.ordersHandled).toBe(3);
    expect(stats.cancelled).toBe(1);
    expect(stats.netVariance).toBe(-20);
  });

  it("treats former staff as history, not headcount", () => {
    const entries = buildStaffDirectory({
      members: [member()],
      events: [event({ id: "gone", actorUserId: "ghost", actorName: "Gone" })],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    });
    expect(summarizeTeam(entries).headcount).toBe(1);
  });
});

describe("groupActivityByDay", () => {
  it("groups by the merchant's own day, newest first", () => {
    const days = groupActivityByDay(
      [
        event({ id: "late", occurredAt: "2026-09-18T15:30:00Z" }),
        event({ id: "next", occurredAt: "2026-09-18T17:30:00Z" }),
      ],
      [],
    );
    expect(days.map((day) => day.dayKey)).toEqual(["2026-09-19", "2026-09-18"]);
  });

  it("gives each day its own counts, takings, shifts and newest-first acts", () => {
    const days = groupActivityByDay(
      [
        event({ id: "p", event: "placed", status: "pending", source: "pos", orderTotal: 200, occurredAt: "2026-09-19T02:00:00Z" }),
        event({ id: "c", occurredAt: "2026-09-19T03:00:00Z" }),
        event({ id: "x", status: "cancelled", occurredAt: "2026-09-19T04:00:00Z" }),
      ],
      [shift({ openedAt: "2026-09-19T01:00:00Z", closedAt: "2026-09-19T09:00:00Z" })],
    );
    expect(days).toHaveLength(1);
    expect(days[0].summary).toMatchObject({ posSales: 1, posSalesTotal: 200, confirmed: 1, cancelled: 1 });
    expect(days[0].shifts).toHaveLength(1);
    expect(days[0].events.map((entry) => entry.id)).toEqual(["x", "c", "p"]);
  });

  it("keeps a day someone was on shift with no orders — being on is activity", () => {
    const days = groupActivityByDay([], [shift({ openedAt: "2026-09-17T01:00:00Z", closedAt: "2026-09-17T09:00:00Z" })]);
    expect(days.map((day) => day.dayKey)).toEqual(["2026-09-17"]);
    expect(days[0].events).toHaveLength(0);
  });
});
