import { estimateDeliveryFinish } from "./eta";

const RULES = { quietHoursStart: "21:00", quietHoursEnd: "08:00", dailyLimit: 100 };
const NOON = Date.parse("2026-10-13T04:00:00Z"); // 12:00 Manila
const MIN = 60_000;

describe("estimateDeliveryFinish", () => {
  it("is now when nothing is waiting", () => {
    expect(estimateDeliveryFinish({ waiting: 0, sentToday: 0, now: NOON, rules: RULES })).toBe(NOON);
  });

  it("sends 25 per half hour", () => {
    expect(estimateDeliveryFinish({ waiting: 25, sentToday: 0, now: NOON, rules: RULES })).toBe(NOON);
    expect(estimateDeliveryFinish({ waiting: 60, sentToday: 0, now: NOON, rules: RULES })).toBe(NOON + 60 * MIN);
  });

  it("waits for the next day once the daily limit is reached", () => {
    const at = estimateDeliveryFinish({ waiting: 10, sentToday: 100, now: NOON, rules: RULES });
    expect(at).toBe(Date.parse("2026-10-14T00:00:00Z")); // 8:00 AM Manila, after quiet hours
  });

  it("holds through quiet hours", () => {
    const tenPm = Date.parse("2026-10-13T14:00:00Z");
    expect(estimateDeliveryFinish({ waiting: 5, sentToday: 0, now: tenPm, rules: RULES }))
      .toBe(Date.parse("2026-10-14T00:00:00Z"));
  });

  it("gives up (null) on a backlog that would take more than two weeks", () => {
    expect(estimateDeliveryFinish({ waiting: 5000, sentToday: 0, now: NOON, rules: RULES })).toBeNull();
  });
});
