import { computeChange, quickTenderSuggestions } from "./pos-cash";

describe("computeChange", () => {
  it("returns the change due when the cashier is handed more than the total", () => {
    expect(computeChange(327.5, 500)).toEqual({ changeDue: 172.5, isSufficient: true });
  });

  it("treats exact payment as sufficient with zero change", () => {
    expect(computeChange(250, 250)).toEqual({ changeDue: 0, isSufficient: true });
  });

  it("reports insufficient and no change when the tender is short", () => {
    expect(computeChange(500, 200)).toEqual({ changeDue: 0, isSufficient: false });
  });

  it("rounds to whole centavos instead of leaking float noise", () => {
    // 0.1 + 0.2 style drift: 100.10 tendered on 99.90 must be exactly 0.20.
    expect(computeChange(99.9, 100.1).changeDue).toBe(0.2);
    expect(computeChange(0.07, 1).changeDue).toBe(0.93);
  });

  it("never treats a negative tender as payment", () => {
    expect(computeChange(100, -50)).toEqual({ changeDue: 0, isSufficient: false });
  });

  it("rejects non-finite input rather than producing NaN change", () => {
    expect(computeChange(100, Number.NaN)).toEqual({ changeDue: 0, isSufficient: false });
    expect(computeChange(Number.NaN, 100)).toEqual({ changeDue: 0, isSufficient: false });
    expect(computeChange(100, Number.POSITIVE_INFINITY)).toEqual({
      changeDue: 0,
      isSufficient: false,
    });
  });

  it("treats a zero total as already settled by a zero tender", () => {
    expect(computeChange(0, 0)).toEqual({ changeDue: 0, isSufficient: true });
  });

  it("refuses to settle a negative total", () => {
    expect(computeChange(-10, 0)).toEqual({ changeDue: 0, isSufficient: false });
  });
});

describe("quickTenderSuggestions", () => {
  it("offers the exact amount plus the next round notes above it", () => {
    expect(quickTenderSuggestions(327.5)).toEqual([327.5, 350, 400, 500]);
  });

  it("dedupes when the total is already a round amount", () => {
    expect(quickTenderSuggestions(100)).toEqual([100, 500, 1000]);
  });

  it("never suggests less than the total", () => {
    for (const total of [1, 49.99, 250, 812.3, 1500]) {
      for (const suggestion of quickTenderSuggestions(total)) {
        expect(suggestion).toBeGreaterThanOrEqual(total);
      }
    }
  });

  it("returns nothing to tender for a zero or invalid total", () => {
    expect(quickTenderSuggestions(0)).toEqual([]);
    expect(quickTenderSuggestions(-5)).toEqual([]);
    expect(quickTenderSuggestions(Number.NaN)).toEqual([]);
  });

  it("caps the keypad at four suggestions so the row never wraps", () => {
    expect(quickTenderSuggestions(37).length).toBeLessThanOrEqual(4);
    expect(quickTenderSuggestions(1234.56).length).toBeLessThanOrEqual(4);
  });

  it("returns suggestions in ascending order", () => {
    const suggestions = quickTenderSuggestions(612.75);
    expect([...suggestions].sort((a, b) => a - b)).toEqual(suggestions);
  });
});
