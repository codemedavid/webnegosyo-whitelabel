import { staffPeriodWindow } from "./period";

describe("staffPeriodWindow", () => {
  // 2026-10-26 10:13 Manila = 02:13 UTC
  const nowMs = Date.parse("2026-10-26T02:13:00.000Z");

  test("Today starts at Manila midnight, not 24 hours ago", () => {
    const window = staffPeriodWindow(1, nowMs);
    expect(new Date(window.startMs).toISOString()).toBe("2026-10-25T16:00:00.000Z");
    expect(window.endMs).toBe(nowMs);
  });

  test("7 days covers today plus the six days before", () => {
    const window = staffPeriodWindow(7, nowMs);
    expect(new Date(window.startMs).toISOString()).toBe("2026-10-19T16:00:00.000Z");
  });

  test("a late-night instant still belongs to that Manila day", () => {
    const lateNight = Date.parse("2026-10-26T15:59:00.000Z"); // 11:59 PM Manila
    expect(new Date(staffPeriodWindow(1, lateNight).startMs).toISOString()).toBe(
      "2026-10-25T16:00:00.000Z",
    );
  });
});
