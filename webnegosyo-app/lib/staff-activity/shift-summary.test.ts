import {
  shiftDurationMs,
  shiftTurnover,
  summarizeShifts,
  verdictForShift,
} from "./shift-summary";
import type { ShiftRecord } from "../shift-service";

const OPENED = Date.parse("2026-09-19T01:00:00Z");

function shift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "s1",
    outletId: null,
    staffUserId: "ana",
    staffName: "Ana",
    status: "closed",
    openingFloat: 500,
    expectedCash: 1500,
    closingCount: 1500,
    note: null,
    openedAt: new Date(OPENED).toISOString(),
    closedAt: new Date(OPENED + 8 * 3_600_000).toISOString(),
    ...overrides,
  };
}

describe("verdictForShift", () => {
  it("does not judge a drawer that is still open", () => {
    expect(
      verdictForShift(shift({ status: "open", closedAt: null, expectedCash: null, closingCount: null })),
    ).toEqual({ kind: "open", variance: null });
  });

  it("reports an uncounted drawer as uncounted, never as balanced", () => {
    expect(verdictForShift(shift({ expectedCash: null, closingCount: null }))).toEqual({
      kind: "uncounted",
      variance: null,
    });
  });

  it("calls a drawer balanced, short or over by the difference", () => {
    expect(verdictForShift(shift())).toEqual({ kind: "balanced", variance: 0 });
    expect(verdictForShift(shift({ closingCount: 1450 }))).toEqual({ kind: "short", variance: -50 });
    expect(verdictForShift(shift({ closingCount: 1520.5 }))).toEqual({ kind: "over", variance: 20.5 });
  });

  it("never accuses a correctly counted drawer over centavo drift", () => {
    expect(
      verdictForShift(shift({ openingFloat: 0.1, expectedCash: 0.3, closingCount: 0.1 + 0.2 })).kind,
    ).toBe("balanced");
  });
});

describe("shiftTurnover", () => {
  it("is the cash collected — the float goes back in the drawer", () => {
    expect(shiftTurnover(shift())).toBe(1000);
  });

  it("is unknown until the register says what it expected", () => {
    expect(shiftTurnover(shift({ expectedCash: null }))).toBeNull();
  });

  it("never reads negative when refunds outran takings", () => {
    expect(shiftTurnover(shift({ expectedCash: 400 }))).toBe(0);
  });
});

describe("shiftDurationMs", () => {
  it("measures a closed shift by its own stamps and an open one up to now", () => {
    expect(shiftDurationMs(shift(), OPENED + 99 * 3_600_000)).toBe(8 * 3_600_000);
    expect(
      shiftDurationMs(shift({ status: "open", closedAt: null }), OPENED + 2 * 3_600_000),
    ).toBe(2 * 3_600_000);
  });

  it("yields no negative hours from a clock that disagrees with itself", () => {
    expect(shiftDurationMs(shift({ status: "open", closedAt: null }), OPENED - 1000)).toBe(0);
  });
});

describe("summarizeShifts", () => {
  it("adds up time on the floor, cash handed over and the drift", () => {
    const totals = summarizeShifts(
      [
        shift({ id: "a", closingCount: 1450 }),
        shift({ id: "b", closingCount: 1510 }),
        shift({ id: "c", status: "open", closedAt: null, expectedCash: null, closingCount: null }),
      ],
      OPENED + 9 * 3_600_000,
    );
    expect(totals).toEqual({
      count: 3,
      openCount: 1,
      countedCount: 2,
      workedMs: 8 * 3_600_000 + 8 * 3_600_000 + 9 * 3_600_000,
      turnover: 2000,
      netVariance: -40,
      shortCount: 1,
      overCount: 1,
    });
  });

  it("claims no variance at all when no drawer was ever counted", () => {
    const totals = summarizeShifts([shift({ expectedCash: null, closingCount: null })], OPENED);
    expect(totals.netVariance).toBeNull();
    expect(totals.countedCount).toBe(0);
  });

  it("reads an empty history as zero, not as a crash", () => {
    expect(summarizeShifts([], OPENED).count).toBe(0);
  });
});
