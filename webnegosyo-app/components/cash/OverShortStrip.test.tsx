/**
 * A cashier's last shifts as a diverging strip around zero (06 §4.5
 * "Cashier over/short"). Phrased as a pattern, never a verdict; a forced close
 * (nobody counted) is a gap, not an "exact"; bars scale to the biggest miss.
 */
import React from "react";
import { render } from "@testing-library/react-native";

import { OverShortStrip } from "./OverShortStrip";
import { overShortBars, overShortSentence, overShortSummary, type OverShortShift } from "./over-short";

const SHIFTS: OverShortShift[] = [
  { id: "a", label: "Oct 20", differenceCents: -12000 },
  { id: "b", label: "Oct 21", differenceCents: 0 },
  { id: "c", label: "Oct 22", differenceCents: 4000 },
  { id: "d", label: "Oct 23", differenceCents: null },
  { id: "e", label: "Oct 24", differenceCents: -14000 },
];

describe("over-short rules", () => {
  it("summary counts short, over, exact and uncounted, and totals what was counted", () => {
    expect(overShortSummary(SHIFTS)).toEqual({ shifts: 5, shortCount: 2, overCount: 1, exactCount: 1, uncountedCount: 1, totalCents: -22000 });
  });

  it("the sentence is a pattern, never a verdict", () => {
    expect(overShortSentence("Ana", overShortSummary(SHIFTS))).toBe("Ana was short 2 times and over once in the last 5 shifts · −₱220 in all");
    expect(overShortSentence("Ben", overShortSummary([{ id: "x", label: "Oct 1", differenceCents: 0 }]))).toBe("Ben matched the drawer on every counted shift");
    expect(overShortSentence("Ben", overShortSummary([]))).toBe("No counted shifts yet");
  });

  it("bars scale to the biggest miss; uncounted shifts have no bar", () => {
    const bars = overShortBars(SHIFTS);
    expect(bars.map((b) => [b.direction, Math.round(b.ratio * 100)])).toEqual([
      ["short", 86],
      ["exact", 0],
      ["over", 29],
      ["none", 0],
      ["short", 100],
    ]);
  });
});

describe("OverShortStrip", () => {
  it("renders one bar per shift and reads the pattern to a screen reader", () => {
    const { getByText, getByTestId, getAllByTestId } = render(<OverShortStrip staffName="Ana" shifts={SHIFTS} />);
    expect(getByText("Ana was short 2 times and over once in the last 5 shifts · −₱220 in all")).toBeTruthy();
    expect(getAllByTestId(/^over-short-bar-/)).toHaveLength(5);
    expect(getByTestId("over-short-bar-a").props.accessibilityLabel).toBe("Oct 20: short ₱120");
    expect(getByTestId("over-short-bar-d").props.accessibilityLabel).toBe("Oct 23: not counted");
  });
});
