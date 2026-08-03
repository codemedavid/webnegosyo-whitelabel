import {
  computeNextDueAt,
  isWithinQuietHours,
  shiftOutOfQuietHours,
  toManilaParts,
} from "./schedule";
import type { SmsCampaignSchedule } from "./types";

function schedule(overrides: Partial<SmsCampaignSchedule> = {}): SmsCampaignSchedule {
  return {
    scheduleKind: "one_off",
    scheduleTime: "10:00",
    scheduleDate: "2026-08-20",
    scheduleIntervalDays: null,
    scheduleWeekdays: [],
    quietHoursStart: "21:00",
    quietHoursEnd: "08:00",
    ...overrides,
  };
}

describe("toManilaParts — the app must think in the merchant's clock", () => {
  it("reads an instant as Manila local time, not UTC", () => {
    // 2026-08-16T18:00Z is 02:00 on 17 August in Manila (UTC+8).
    expect(toManilaParts(new Date("2026-08-16T18:00:00.000Z"))).toEqual({
      date: "2026-08-17",
      time: "02:00",
      weekday: 1, // Monday, ISO
    });
  });

  it("numbers Sunday as 7, the ISO way", () => {
    // 2026-08-16 is a Sunday in Manila.
    expect(toManilaParts(new Date("2026-08-16T02:00:00.000Z")).weekday).toBe(7);
  });
});

describe("isWithinQuietHours", () => {
  it("is quiet late at night inside a window that wraps midnight", () => {
    expect(isWithinQuietHours("22:30", "21:00", "08:00")).toBe(true);
  });

  it("is quiet early in the morning inside the same wrapping window", () => {
    expect(isWithinQuietHours("06:00", "21:00", "08:00")).toBe(true);
  });

  it("is not quiet during trading hours", () => {
    expect(isWithinQuietHours("10:00", "21:00", "08:00")).toBe(false);
  });

  it("treats the start of the window as quiet and the end as open", () => {
    expect(isWithinQuietHours("21:00", "21:00", "08:00")).toBe(true);
    expect(isWithinQuietHours("08:00", "21:00", "08:00")).toBe(false);
  });

  it("handles a same-day window that does not wrap", () => {
    expect(isWithinQuietHours("13:00", "12:00", "14:00")).toBe(true);
    expect(isWithinQuietHours("15:00", "12:00", "14:00")).toBe(false);
  });

  it("is never quiet when the window has zero width", () => {
    expect(isWithinQuietHours("03:00", "08:00", "08:00")).toBe(false);
  });
});

describe("shiftOutOfQuietHours — a 2am marketing blast is how a SIM gets reported", () => {
  it("leaves a daytime send exactly where it is", () => {
    const due = new Date("2026-08-20T02:00:00.000Z"); // 10:00 Manila

    expect(shiftOutOfQuietHours(due, "21:00", "08:00")).toEqual(due);
  });

  it("holds a late-night send until the window opens the next morning", () => {
    const due = new Date("2026-08-20T14:00:00.000Z"); // 22:00 Manila, 20 Aug

    // 08:00 Manila on 21 Aug === 2026-08-21T00:00Z
    expect(shiftOutOfQuietHours(due, "21:00", "08:00")).toEqual(
      new Date("2026-08-21T00:00:00.000Z")
    );
  });

  it("holds an early-morning send until later the same morning", () => {
    const due = new Date("2026-08-19T22:00:00.000Z"); // 06:00 Manila, 20 Aug

    expect(shiftOutOfQuietHours(due, "21:00", "08:00")).toEqual(
      new Date("2026-08-20T00:00:00.000Z")
    );
  });
});

describe("computeNextDueAt — one_off", () => {
  it("returns the scheduled moment in Manila time", () => {
    const due = computeNextDueAt(schedule(), { after: new Date("2026-08-16T02:00:00.000Z") });

    // 10:00 Manila on 20 Aug === 2026-08-20T02:00Z
    expect(due).toEqual(new Date("2026-08-20T02:00:00.000Z"));
  });

  it("returns null once the one-off date has passed, so it never fires twice", () => {
    const due = computeNextDueAt(schedule(), { after: new Date("2026-08-21T02:00:00.000Z") });

    expect(due).toBeNull();
  });

  it("returns null when the date is missing rather than firing immediately", () => {
    expect(
      computeNextDueAt(schedule({ scheduleDate: null }), { after: new Date(NOW_ISO) })
    ).toBeNull();
  });
});

const NOW_ISO = "2026-08-16T02:00:00.000Z"; // Sun 16 Aug, 10:00 Manila

describe("computeNextDueAt — every_n_days", () => {
  const everyThree = schedule({
    scheduleKind: "every_n_days",
    scheduleIntervalDays: 3,
    scheduleDate: null,
    scheduleTime: "10:00",
  });

  it("fires one interval after the last run", () => {
    const due = computeNextDueAt(everyThree, {
      after: new Date(NOW_ISO),
      lastRunAt: new Date("2026-08-15T02:00:00.000Z"), // 15 Aug 10:00 Manila
    });

    expect(due).toEqual(new Date("2026-08-18T02:00:00.000Z")); // 18 Aug 10:00 Manila
  });

  it("fires today when the interval has already elapsed and the hour has not passed", () => {
    const due = computeNextDueAt(everyThree, {
      after: new Date("2026-08-20T00:00:00.000Z"), // 08:00 Manila, 20 Aug
      lastRunAt: new Date("2026-08-01T02:00:00.000Z"),
    });

    expect(due).toEqual(new Date("2026-08-20T02:00:00.000Z")); // 10:00 Manila same day
  });

  it("rolls to tomorrow when today's send time has already gone by", () => {
    const due = computeNextDueAt(everyThree, {
      after: new Date("2026-08-20T06:00:00.000Z"), // 14:00 Manila, past 10:00
      lastRunAt: new Date("2026-08-01T02:00:00.000Z"),
    });

    expect(due).toEqual(new Date("2026-08-21T02:00:00.000Z"));
  });

  it("starts from the campaign's creation date when it has never run", () => {
    const due = computeNextDueAt(everyThree, {
      after: new Date(NOW_ISO),
      createdAt: new Date("2026-08-14T02:00:00.000Z"),
    });

    expect(due).toEqual(new Date("2026-08-17T02:00:00.000Z"));
  });

  it("returns null when the interval is missing rather than looping every minute", () => {
    expect(
      computeNextDueAt(schedule({ scheduleKind: "every_n_days", scheduleIntervalDays: null }), {
        after: new Date(NOW_ISO),
      })
    ).toBeNull();
  });
});

describe("computeNextDueAt — weekly", () => {
  // 2026-08-16 Manila is a Sunday (ISO 7).
  const mondayAndThursday = schedule({
    scheduleKind: "weekly",
    scheduleWeekdays: [1, 4],
    scheduleDate: null,
    scheduleTime: "10:00",
  });

  it("fires on the next configured weekday", () => {
    const due = computeNextDueAt(mondayAndThursday, { after: new Date(NOW_ISO) });

    // Next Monday is 17 Aug, 10:00 Manila.
    expect(due).toEqual(new Date("2026-08-17T02:00:00.000Z"));
  });

  it("fires later today when today is a configured weekday and the hour has not passed", () => {
    const due = computeNextDueAt(mondayAndThursday, {
      after: new Date("2026-08-17T00:00:00.000Z"), // Mon 08:00 Manila
    });

    expect(due).toEqual(new Date("2026-08-17T02:00:00.000Z"));
  });

  it("skips to the next configured weekday when today's slot has gone by", () => {
    const due = computeNextDueAt(mondayAndThursday, {
      after: new Date("2026-08-17T06:00:00.000Z"), // Mon 14:00 Manila
    });

    expect(due).toEqual(new Date("2026-08-20T02:00:00.000Z")); // Thu 20 Aug
  });

  it("returns null when no weekday is configured rather than firing every day", () => {
    expect(
      computeNextDueAt(schedule({ scheduleKind: "weekly", scheduleWeekdays: [] }), {
        after: new Date(NOW_ISO),
      })
    ).toBeNull();
  });
});

describe("computeNextDueAt — quiet hours are applied to the result", () => {
  it("pushes a send scheduled inside quiet hours to the morning", () => {
    const lateNight = schedule({ scheduleTime: "23:00", scheduleDate: "2026-08-20" });

    const due = computeNextDueAt(lateNight, { after: new Date(NOW_ISO) });

    // 23:00 Manila 20 Aug is quiet -> held to 08:00 Manila on 21 Aug.
    expect(due).toEqual(new Date("2026-08-21T00:00:00.000Z"));
  });
});
