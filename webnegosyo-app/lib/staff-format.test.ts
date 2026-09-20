import {
  formatClock,
  formatDayLabel,
  formatLastActive,
  formatShiftLength,
  initialsOf,
} from "./staff-format";

describe("formatDayLabel", () => {
  const today = "2026-09-19T02:00:00Z"; // 10am Manila on the 19th

  it("names the merchant's today and yesterday in words", () => {
    expect(formatDayLabel("2026-09-19", today)).toBe("Today");
    expect(formatDayLabel("2026-09-18", today)).toBe("Yesterday");
  });

  it("reads older days as a calendar date", () => {
    expect(formatDayLabel("2026-09-14", today)).toBe("Mon, 14 Sep 2026");
  });

  it("keeps late-evening Manila on today, not tomorrow", () => {
    expect(formatDayLabel("2026-09-19", "2026-09-19T15:30:00Z")).toBe("Today");
  });
});

describe("formatLastActive", () => {
  const now = Date.parse("2026-09-19T10:00:00Z");

  it("says so plainly when there is nothing to report", () => {
    expect(formatLastActive(null, now)).toBe("No activity yet");
  });

  it("reads in minutes, hours and days as the gap grows", () => {
    expect(formatLastActive(new Date(now - 30_000).toISOString(), now)).toBe("Just now");
    expect(formatLastActive(new Date(now - 12 * 60_000).toISOString(), now)).toBe("12m ago");
    expect(formatLastActive(new Date(now - 5 * 3_600_000).toISOString(), now)).toBe("5h ago");
    expect(formatLastActive(new Date(now - 3 * 86_400_000).toISOString(), now)).toBe("3d ago");
  });

  it("gives a date once a relative gap stops meaning anything", () => {
    expect(formatLastActive("2026-08-02T04:00:00Z", now)).toBe("2 Aug 2026");
  });
});

describe("formatClock", () => {
  it("reads on the merchant's clock whatever the device timezone", () => {
    expect(formatClock("2026-09-19T01:12:00Z")).toBe("9:12 AM");
    expect(formatClock("2026-09-19T13:05:00Z")).toBe("9:05 PM");
  });

  it("does not print midnight or noon as zero o'clock", () => {
    expect(formatClock("2026-09-18T16:00:00Z")).toBe("12:00 AM");
    expect(formatClock("2026-09-19T04:00:00Z")).toBe("12:00 PM");
  });

  it("refuses a stamp that is not a time rather than throwing", () => {
    expect(formatClock("not-a-date")).toBe("—");
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Ana Cruz Santos")).toBe("AC");
  });

  it("reads an email as the person it belongs to", () => {
    expect(initialsOf("ana@example.com")).toBe("AN");
    expect(initialsOf("Ana")).toBe("AN");
  });

  it("never renders empty", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("formatShiftLength", () => {
  it("reads in hours and minutes, and never as nothing", () => {
    expect(formatShiftLength(7 * 3_600_000 + 20 * 60_000)).toBe("7h 20m");
    expect(formatShiftLength(45 * 60_000)).toBe("45m");
    expect(formatShiftLength(0)).toBe("0m");
  });
});
