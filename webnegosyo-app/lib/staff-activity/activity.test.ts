import {
  describeActivity,
  summarizeActorActivity,
  summarizeTeamActivity,
  type OrderActivityEvent,
} from "./activity";

const T0 = Date.parse("2026-09-19T08:00:00Z");
const HOUR = 3600_000;
const WINDOW = { startMs: T0, endMs: T0 + 8 * HOUR };

function event(overrides: Partial<OrderActivityEvent>): OrderActivityEvent {
  return {
    id: "e",
    externalOrderId: "o",
    event: "status_changed",
    status: "confirmed",
    source: "online",
    orderTotal: 100,
    actorUserId: "ana",
    actorName: "Ana",
    occurredAt: new Date(T0 + HOUR).toISOString(),
    ...overrides,
  };
}

describe("summarizeActorActivity", () => {
  test("counts one person's confirms, cancels, completions and register sales inside the window", () => {
    const summary = summarizeActorActivity(
      [
        event({ id: "1" }),
        event({ id: "2", status: "cancelled" }),
        event({ id: "3", status: "delivered" }),
        event({ id: "4", status: "ready" }),
        event({ id: "5", event: "placed", status: "pending", source: "pos", orderTotal: 40 }),
        event({ id: "6", actorUserId: "ben" }),
        event({ id: "7", occurredAt: new Date(T0 - 1).toISOString() }),
      ],
      "ana",
      WINDOW,
    );
    expect(summary).toEqual({
      posSales: 1,
      posSalesTotal: 40,
      confirmed: 1,
      confirmedTotal: 100,
      cancelled: 1,
      completed: 1,
      progressed: 1,
    });
  });
});

describe("summarizeTeamActivity", () => {
  test("one row per person, busiest first, anonymous events dropped", () => {
    const rows = summarizeTeamActivity(
      [event({ id: "1" }), event({ id: "2", actorUserId: "ben", actorName: "Ben" }), event({ id: "3", actorUserId: "ben" }), event({ id: "4", actorUserId: null })],
      WINDOW,
    );
    expect(rows.map((row) => row.actorUserId)).toEqual(["ben", "ana"]);
    expect(rows[0].summary.confirmed).toBe(2);
  });
});

describe("describeActivity", () => {
  test("reads as one line, and says so when nothing happened", () => {
    expect(describeActivity({ posSales: 2, posSalesTotal: 0, confirmed: 3, confirmedTotal: 0, cancelled: 1, completed: 0, progressed: 0 })).toBe(
      "Web orders: confirmed 3 · cancelled 1",
    );
    expect(describeActivity({ posSales: 0, posSalesTotal: 0, confirmed: 0, confirmedTotal: 0, cancelled: 0, completed: 0, progressed: 0 })).toBe("No web orders handled");
  });
});
