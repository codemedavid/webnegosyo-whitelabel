import { todayRange, yesterdayRange, revenueDelta } from "./home-period";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Epoch ms of the Manila midnight opening `dayKey`. */
function manilaMidnight(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - MANILA_OFFSET_MS;
}

// 12:30 in Manila on the 19th.
const NOON = Date.parse("2026-09-19T04:30:00.000Z");

describe("todayRange / yesterdayRange", () => {
  it("covers the Manila calendar day, midnight to a millisecond before the next", () => {
    const today = todayRange(NOON);
    expect(today.startDate).toBe(manilaMidnight("2026-09-19"));
    expect(today.endDate).toBe(manilaMidnight("2026-09-20") - 1);
  });

  it("makes yesterday end exactly where today begins", () => {
    const today = todayRange(NOON);
    const yesterday = yesterdayRange(NOON);
    expect(yesterday.endDate).toBe(today.startDate - 1);
    expect(yesterday.startDate).toBe(manilaMidnight("2026-09-18"));
  });

  it("uses the Manila day even when the phone's clock is on UTC", () => {
    // 01:00 Manila on the 19th is still the 18th in UTC. The server's "today"
    // (and every report) already runs on Manila; Home's comparison must too,
    // or its yesterday is a different day from the report's Yesterday.
    const earlyMorning = Date.parse("2026-09-18T17:00:00.000Z");
    expect(todayRange(earlyMorning).startDate).toBe(manilaMidnight("2026-09-19"));
    expect(yesterdayRange(earlyMorning).startDate).toBe(manilaMidnight("2026-09-18"));
  });
});

describe("revenueDelta", () => {
  it("reports the change as a fraction of yesterday", () => {
    expect(revenueDelta(1120, 1000)).toBeCloseTo(0.12);
    expect(revenueDelta(800, 1000)).toBeCloseTo(-0.2);
  });

  it("has nothing to say until both days are known", () => {
    expect(revenueDelta(undefined, 1000)).toBeNull();
    expect(revenueDelta(1000, undefined)).toBeNull();
  });

  it("has nothing to say against a zero day", () => {
    // Anything over nothing is not "up infinitely"; it is a first day.
    expect(revenueDelta(500, 0)).toBeNull();
  });
});
