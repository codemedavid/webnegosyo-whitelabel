import { describeShiftStatus, formatShiftElapsed } from "./shift-status";

const AT_8AM = "2026-09-19T00:14:00.000Z"; // 08:14 Manila
const nowAfter = (ms: number) => Date.parse(AT_8AM) + ms;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("formatShiftElapsed", () => {
  it("reads in minutes for the first hour", () => {
    expect(formatShiftElapsed(42 * MINUTE)).toBe("42m");
  });

  it("reads in hours and minutes once past an hour", () => {
    expect(formatShiftElapsed(3 * HOUR + 12 * MINUTE)).toBe("3h 12m");
  });

  it("drops the minutes when there are none", () => {
    expect(formatShiftElapsed(5 * HOUR)).toBe("5h");
  });

  it("never reads negative when the device clock is behind the server", () => {
    expect(formatShiftElapsed(-5 * MINUTE)).toBe("0m");
  });
});

describe("describeShiftStatus", () => {
  it("names the shift as open and how long it has run", () => {
    // Arrange
    const shift = { openedAt: AT_8AM };

    // Act
    const view = describeShiftStatus(shift, nowAfter(3 * HOUR + 12 * MINUTE));

    // Assert
    expect(view.isOpen).toBe(true);
    expect(view.title).toBe("On shift");
    expect(view.detail).toContain("3h 12m");
  });

  it("says the clock has not started when no shift is open", () => {
    const view = describeShiftStatus(null, nowAfter(0));

    expect(view.isOpen).toBe(false);
    expect(view.title).toBe("Not clocked in");
    expect(view.detail.length).toBeGreaterThan(0);
  });

  it("survives a shift row whose stamp cannot be parsed", () => {
    // A blank detail would read as "no shift"; the strip must still say the
    // drawer is open, because the money in it is real either way.
    const view = describeShiftStatus({ openedAt: "not-a-date" }, nowAfter(0));

    expect(view.isOpen).toBe(true);
    expect(view.detail).toBe("Drawer open");
  });
});
