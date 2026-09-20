import { todayRange, yesterdayRange, revenueDelta } from "./home-period";

const NOON = new Date(2026, 8, 19, 12, 30);

describe("todayRange / yesterdayRange", () => {
  it("covers the local calendar day, midnight to a millisecond before the next", () => {
    const today = todayRange(NOON);
    expect(new Date(today.startDate)).toEqual(new Date(2026, 8, 19, 0, 0, 0, 0));
    expect(new Date(today.endDate)).toEqual(new Date(2026, 8, 19, 23, 59, 59, 999));
  });

  it("makes yesterday end exactly where today begins", () => {
    const today = todayRange(NOON);
    const yesterday = yesterdayRange(NOON);
    expect(yesterday.endDate).toBe(today.startDate - 1);
    expect(new Date(yesterday.startDate)).toEqual(new Date(2026, 8, 18, 0, 0, 0, 0));
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
