/**
 * A shift is a drawer with a name on it.
 *
 * The owner's question at the end of the day is not "how much did the store
 * make" — the sales screens already answer that — but "how much cash should
 * THIS person hand me, and does what they counted match it". These rules turn
 * a shift's opening float and its cash takings into that answer, and refuse
 * the inputs that would make the answer a lie (a negative float, a counted
 * amount typed as text, a drawer reconciled before it was counted).
 *
 * Pure and side-effect free: the screen owns the fetching, this owns the
 * arithmetic, mirroring pos-sales.ts.
 */

import {
  judgeShift,
  reconcileShift,
  validateCashAmount,
} from "./shift";

describe("validateCashAmount", () => {
  it("accepts a whole-peso float", () => {
    expect(validateCashAmount(500)).toEqual({ ok: true, amount: 500 });
  });

  it("accepts centavos and keeps them exact", () => {
    expect(validateCashAmount(1250.75)).toEqual({ ok: true, amount: 1250.75 });
  });

  it("accepts an empty drawer — zero is a real float", () => {
    expect(validateCashAmount(0)).toEqual({ ok: true, amount: 0 });
  });

  it("refuses a negative amount rather than clamping it", () => {
    // A cashier meaning 500 and typing -500 should be corrected, not have the
    // register quietly decide what they meant.
    const verdict = validateCashAmount(-500);
    expect(verdict.ok).toBe(false);
  });

  it("refuses NaN — a blank field is not a zero float", () => {
    expect(validateCashAmount(Number.NaN).ok).toBe(false);
  });

  it("refuses Infinity", () => {
    expect(validateCashAmount(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it("says why it refused, in words a cashier can act on", () => {
    const verdict = validateCashAmount(-1);
    if (verdict.ok) throw new Error("expected a refusal");
    expect(verdict.reason.length).toBeGreaterThan(0);
  });
});

describe("judgeShift", () => {
  it("reads a shift with no closing time as open", () => {
    expect(judgeShift({ closed_at: null })).toBe("open");
  });

  it("reads a shift with a closing time as closed", () => {
    expect(judgeShift({ closed_at: "2026-08-20T18:00:00Z" })).toBe("closed");
  });
});

describe("reconcileShift", () => {
  it("expects the drawer to hold the float plus the cash taken", () => {
    const r = reconcileShift({ openingFloat: 500, cashCollected: 4250 });
    expect(r.expectedInDrawer).toBe(4750);
  });

  it("names the turnover as the cash taken, not the whole drawer", () => {
    // The float goes back in the drawer for the next shift; the staff member
    // hands over what they COLLECTED. Calling the whole drawer "turnover"
    // would accuse every cashier of keeping the float.
    const r = reconcileShift({ openingFloat: 500, cashCollected: 4250 });
    expect(r.expectedTurnover).toBe(4250);
  });

  it("leaves the variance unjudged until the drawer is counted", () => {
    const r = reconcileShift({ openingFloat: 500, cashCollected: 4250 });
    expect(r.variance).toBeNull();
    expect(r.verdict).toBe("uncounted");
  });

  it("declares a counted drawer that matches balanced", () => {
    const r = reconcileShift({
      openingFloat: 500,
      cashCollected: 4250,
      countedCash: 4750,
    });
    expect(r.variance).toBe(0);
    expect(r.verdict).toBe("balanced");
  });

  it("reports a short drawer as short, with the missing amount", () => {
    const r = reconcileShift({
      openingFloat: 500,
      cashCollected: 4250,
      countedCash: 4700,
    });
    expect(r.variance).toBe(-50);
    expect(r.verdict).toBe("short");
  });

  it("reports an over drawer as over, not as a bonus", () => {
    const r = reconcileShift({
      openingFloat: 500,
      cashCollected: 4250,
      countedCash: 4800,
    });
    expect(r.variance).toBe(50);
    expect(r.verdict).toBe("over");
  });

  it("does not manufacture a centavo variance out of float arithmetic", () => {
    // 0.1 + 0.2 !== 0.3 in floating point. A drawer counted to the centavo
    // must not be flagged short by the machine's own arithmetic.
    const r = reconcileShift({
      openingFloat: 0.1,
      cashCollected: 0.2,
      countedCash: 0.3,
    });
    expect(r.variance).toBe(0);
    expect(r.verdict).toBe("balanced");
  });

  it("a counted drawer of zero is a count, not an uncounted drawer", () => {
    const r = reconcileShift({
      openingFloat: 0,
      cashCollected: 100,
      countedCash: 0,
    });
    expect(r.verdict).toBe("short");
    expect(r.variance).toBe(-100);
  });
});
