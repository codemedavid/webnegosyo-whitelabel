import { dayClosedMessage, isDayClosedRefusal, parseCountAttempts, recountLine, recountOf } from "./shift-recount";

describe("recount flag", () => {
  it("says a drawer was counted twice when the second count changed the figure", () => {
    const recount = recountOf([
      { attempt: 1, countedCents: 0 },
      { attempt: 2, countedCents: 834500 },
    ]);
    expect(recount).toEqual({ firstCents: 0, finalCents: 834500 });
    expect(recountLine(recount)).toBe("Counted twice: ₱0 → ₱8,345");
  });

  it("says nothing for one count, or a recount that came to the same figure", () => {
    expect(recountOf([{ attempt: 1, countedCents: 100 }])).toBeNull();
    expect(recountOf([{ attempt: 1, countedCents: 100 }, { attempt: 2, countedCents: 100 }])).toBeNull();
    expect(recountLine(null)).toBeNull();
  });

  it("reads shift_counts rows and skips anything it cannot trust", () => {
    expect(parseCountAttempts([{ attempt: 1, counted_cents: "834500" }, { attempt: 2, counted_cents: 1.5 }, null, "x"])).toEqual([
      { attempt: 1, countedCents: 834500 },
    ]);
    expect(parseCountAttempts(null)).toEqual([]);
  });
});

describe("closed business day", () => {
  it("recognises the server's refusal and words what to do", () => {
    expect(isDayClosedRefusal("day_closed: Friday is closed for this branch.")).toBe(true);
    expect(isDayClosedRefusal("The shift could not be started (This business day is closed.)")).toBe(true);
    expect(isDayClosedRefusal("Starting cash must be between ₱0 and ₱10,000,000.")).toBe(false);
    expect(isDayClosedRefusal(null)).toBe(false);
    expect(dayClosedMessage("4:00 AM")).toBe("Today is closed — reopen it from Day close, or wait until 4:00 AM to start a shift.");
  });
});
