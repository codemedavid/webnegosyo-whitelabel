import { floatNote, handoverNote, periodToPreselect } from "./shift-start";
import { MIDNIGHT_SCHEDULE } from "../business-day/trading-day";

describe("floatNote", () => {
  it("confirms the usual float, or says the difference without blocking", () => {
    expect(floatNote(200000, 200000)).toEqual({ isUsual: true, text: "Usual float ₱2,000" });
    expect(floatNote(195000, 200000)).toEqual({ isUsual: false, text: "₱50 less than the usual ₱2,000. We'll note it for the owner." });
    expect(floatNote(210000, 200000)?.text).toMatch(/^₱100 more than the usual/);
  });

  it("says nothing without a usual float or a count", () => {
    expect(floatNote(100, null)).toBeNull();
    expect(floatNote(100, 0)).toBeNull();
    expect(floatNote(null, 200000)).toBeNull();
  });
});

describe("periodToPreselect", () => {
  const DAY = { id: "day", name: "Day shift", startsMinutes: 12 * 60, endsMinutes: 20 * 60 };
  const NIGHT = { id: "night", name: "Night shift", startsMinutes: 20 * 60, endsMinutes: 2 * 60 };

  it("picks the named shift running now, the overnight one included", () => {
    // 1 PM Manila
    expect(periodToPreselect([DAY, NIGHT], "2026-10-24T05:00:00.000Z", MIDNIGHT_SCHEDULE)?.id).toBe("day");
    // 11 PM Manila
    expect(periodToPreselect([DAY, NIGHT], "2026-10-24T15:00:00.000Z", MIDNIGHT_SCHEDULE)?.id).toBe("night");
  });

  it("picks none between shifts or with none set up", () => {
    // 6 AM Manila
    expect(periodToPreselect([DAY, NIGHT], "2026-10-23T22:00:00.000Z", MIDNIGHT_SCHEDULE)).toBeNull();
    expect(periodToPreselect([], "2026-10-24T05:00:00.000Z", MIDNIGHT_SCHEDULE)).toBeNull();
  });
});

describe("handoverNote", () => {
  it("says what the last cashier left when the count differs", () => {
    const handover = { previousShiftId: "s0", leftCents: 200000, staffName: "Ana", closedAt: null };
    expect(handoverNote(handover, 195000)).toBe("Ana left ₱2,000 in this drawer. You counted ₱1,950: ₱50 less than they left. It's noted on both shifts.");
    expect(handoverNote(handover, 200000)).toBeNull();
    expect(handoverNote(null, 1)).toBeNull();
  });
});
