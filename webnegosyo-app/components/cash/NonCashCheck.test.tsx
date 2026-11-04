/**
 * Step 2 "GCash & cards" (06 §4.3): one row per non-cash method the shift
 * took, each answered Matches or Different (with the amount the cashier sees),
 * or the whole step left to the owner. What is pinned: the step is complete
 * only when every row is answered (a Different needs an amount), and the
 * answers map onto close_shift's p_non_cash and the remittance slip without
 * inventing a figure (unchecked = no declared amount).
 */
import React, { useState } from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { NonCashCheck } from "./NonCashCheck";
import {
  initialNonCashAnswers,
  isNonCashComplete,
  markAllNonCash,
  setNonCashCheck,
  setNonCashDeclared,
  toCloseNonCash,
  toSlipNonCash,
  type NonCashAnswer,
  type NonCashMethod,
} from "./non-cash";

const METHODS: NonCashMethod[] = [
  { key: "gcash", label: "GCash", cents: 421000, count: 14 },
  { key: "maya", label: "Maya", cents: 86000, count: 3 },
];

describe("non-cash answers", () => {
  it("start unanswered and are complete once each row is answered", () => {
    const start = initialNonCashAnswers(METHODS);
    expect(start.map((a) => a.check)).toEqual(["pending", "pending"]);
    expect(isNonCashComplete(start)).toBe(false);
    const allMatch = markAllNonCash(start, "matches");
    expect(isNonCashComplete(allMatch)).toBe(true);
    expect(start[0].check).toBe("pending");
  });

  it("a Different needs an amount before the step is complete", () => {
    const different = setNonCashCheck(markAllNonCash(initialNonCashAnswers(METHODS), "matches"), "maya", "different");
    expect(isNonCashComplete(different)).toBe(false);
    expect(isNonCashComplete(setNonCashDeclared(different, "maya", 81000))).toBe(true);
  });

  it("no methods = nothing to check (the step is skipped)", () => {
    expect(isNonCashComplete(initialNonCashAnswers([]))).toBe(true);
  });

  it("maps onto close_shift's p_non_cash: matches declares the record, unchecked declares nothing", () => {
    const answers = setNonCashDeclared(
      setNonCashCheck(setNonCashCheck(initialNonCashAnswers(METHODS), "gcash", "matches"), "maya", "different"),
      "maya",
      81000,
    );
    expect(toCloseNonCash(answers)).toEqual([
      { key: "gcash", method: "GCash", expectedCents: 421000, slipCount: 14, check: "matches", declaredCents: 421000, note: null },
      { key: "maya", method: "Maya", expectedCents: 86000, slipCount: 3, check: "different", declaredCents: 81000, note: null },
    ]);
    const left = markAllNonCash(initialNonCashAnswers(METHODS), "unchecked");
    expect(toCloseNonCash(left).map((row) => [row.check, row.declaredCents])).toEqual([
      ["unchecked", null],
      ["unchecked", null],
    ]);
  });

  it("maps onto the remittance slip rows", () => {
    const answers = markAllNonCash(initialNonCashAnswers(METHODS), "matches");
    expect(toSlipNonCash(answers)[0]).toEqual({ label: "GCash", count: 14, cents: 421000, check: "matches", declaredCents: null });
  });
});

let latest: readonly NonCashAnswer[] = [];

function Harness({ references }: { references?: Parameters<typeof NonCashCheck>[0]["references"] }) {
  const [answers, setAnswers] = useState<readonly NonCashAnswer[]>(initialNonCashAnswers(METHODS));
  return (
    <NonCashCheck
      value={answers}
      onChange={(next) => {
        latest = next;
        setAnswers(next);
      }}
      references={references}
    />
  );
}

describe("NonCashCheck", () => {
  it("one row per method with its total and payment count", () => {
    const { getByText } = render(<Harness />);
    expect(getByText("GCash")).toBeTruthy();
    expect(getByText("₱4,210 · 14 payments")).toBeTruthy();
    expect(getByText("₱860 · 3 payments")).toBeTruthy();
  });

  it("All match answers every row", () => {
    const { getByTestId } = render(<Harness />);
    fireEvent.press(getByTestId("non-cash-all-match"));
    expect(latest.map((a) => a.check)).toEqual(["matches", "matches"]);
    expect(getByTestId("non-cash-gcash-matches").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("Different opens an amount and a note; a bad amount says how to type it", () => {
    const { getByTestId, getByText } = render(<Harness />);
    fireEvent.press(getByTestId("non-cash-maya-different"));
    fireEvent.changeText(getByTestId("non-cash-maya-amount"), "8,1o0");
    expect(getByText("Type an amount like 4,150")).toBeTruthy();
    expect(latest.find((a) => a.key === "maya")?.declaredCents).toBeNull();
    fireEvent.changeText(getByTestId("non-cash-maya-amount"), "810");
    expect(latest.find((a) => a.key === "maya")?.declaredCents).toBe(81000);
    fireEvent.changeText(getByTestId("non-cash-maya-note"), "one refund in the Maya app");
    expect(latest.find((a) => a.key === "maya")?.note).toBe("one refund in the Maya app");
  });

  it("I'll leave this to the owner marks every row unchecked", () => {
    const { getByTestId } = render(<Harness />);
    fireEvent.press(getByTestId("non-cash-skip"));
    expect(latest.map((a) => a.check)).toEqual(["unchecked", "unchecked"]);
  });

  it("Show references lists time · ref · amount, only where there are some", () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <Harness references={{ gcash: [{ at: "2026-10-24T10:14:00.000Z", ref: "0912 334", cents: 25000 }] }} />,
    );
    expect(queryByTestId("non-cash-maya-references")).toBeNull();
    fireEvent.press(getByTestId("non-cash-gcash-references"));
    expect(getByText("6:14 PM · 0912 334 · ₱250")).toBeTruthy();
  });

  it("not loaded yet says so; nothing taken says so", () => {
    const loading = render(<NonCashCheck value={null} onChange={jest.fn()} />);
    expect(loading.getByText("Adding up GCash, Maya and cards…")).toBeTruthy();
    const none = render(<NonCashCheck value={[]} onChange={jest.fn()} />);
    expect(none.getByText("No GCash, Maya or card payments this shift.")).toBeTruthy();
  });
});
