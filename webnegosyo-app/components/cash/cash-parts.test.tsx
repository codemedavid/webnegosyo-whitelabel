/**
 * The smaller End-shift parts: the verdict never relies on colour alone and
 * never shows an unknown expected figure as ₱0; the reason chips show the
 * right list and say when a reason is needed; the PIN pad never draws the
 * digits; the step bar names where the cashier is.
 */
import React, { useState } from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { CountModeSwitch, type CountMode } from "./CountModeSwitch";
import { PinPad, nextPin } from "./PinPad";
import { ReasonChips } from "./ReasonChips";
import { StepBar } from "./StepBar";
import { BLIND_LINE, EXACT_LINE, RECOUNT_LINE, STILL_ADDING_LINE, VerdictCard } from "./VerdictCard";
import type { VarianceReasonKey } from "../../lib/cash/reasons";

describe("VerdictCard", () => {
  it("short: word + amount, the three lines, and Recount first", () => {
    const onRecount = jest.fn();
    const { getByText, getByTestId, getByLabelText } = render(<VerdictCard expectedCents={846500} countedCents={834500} onRecount={onRecount} />);
    expect(getByText("Short ₱120.00")).toBeTruthy();
    expect(getByLabelText("Short 120 pesos")).toBeTruthy();
    expect(getByTestId("verdict-expected").props.children).toBe("₱8,465.00");
    expect(getByTestId("verdict-counted").props.children).toBe("₱8,345.00");
    expect(getByTestId("verdict-difference").props.children).toBe("−₱120.00");
    expect(getByText(RECOUNT_LINE)).toBeTruthy();
    fireEvent.press(getByTestId("verdict-recount"));
    expect(onRecount).toHaveBeenCalled();
  });

  it("over and exact", () => {
    const over = render(<VerdictCard expectedCents={10000} countedCents={14000} onRecount={jest.fn()} />);
    expect(over.getByText("Over ₱40.00")).toBeTruthy();
    expect(over.getByTestId("verdict-difference").props.children).toBe("+₱40.00");
    expect(over.queryByTestId("verdict-recount")).toBeNull();
    const exact = render(<VerdictCard expectedCents={10000} countedCents={10000} />);
    expect(exact.getByText(EXACT_LINE)).toBeTruthy();
    expect(exact.getByTestId("verdict-card-exact")).toBeTruthy();
  });

  it("blind: what was counted, no expected figure and no verdict", () => {
    const { getByText, queryByTestId } = render(<VerdictCard expectedCents={846500} countedCents={834500} isBlind />);
    expect(getByText(BLIND_LINE)).toBeTruthy();
    expect(queryByTestId("verdict-expected")).toBeNull();
    expect(queryByTestId("verdict-difference")).toBeNull();
  });

  it("expected not added up yet: says so, never ₱0", () => {
    const { getByText, queryByText } = render(<VerdictCard expectedCents={null} countedCents={500} />);
    expect(getByText(STILL_ADDING_LINE)).toBeTruthy();
    expect(queryByText("₱0.00")).toBeNull();
  });
});

function Reasons({ difference, threshold }: { difference: number; threshold?: number }) {
  const [value, setValue] = useState<VarianceReasonKey | null>(null);
  const [note, setNote] = useState("");
  return <ReasonChips differenceCents={difference} value={value} onChange={setValue} thresholdCents={threshold} note={note} onNoteChange={setNote} />;
}

describe("ReasonChips", () => {
  it("short list, needed above ₱20, one pick at a time, tap again to clear", () => {
    const { getByText, getByTestId, queryByTestId } = render(<Reasons difference={-12000} />);
    expect(getByText("What happened? · needed above ₱20")).toBeTruthy();
    expect(queryByTestId("reason-customer_left_extra")).toBeNull();
    fireEvent.press(getByTestId("reason-wrong_change"));
    expect(getByTestId("reason-wrong_change").props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(getByTestId("reason-not_sure"));
    expect(getByTestId("reason-wrong_change").props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(getByTestId("reason-not_sure"));
    expect(getByTestId("reason-not_sure").props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.changeText(getByTestId("reason-note"), "gave extra change to T4");
    expect(getByTestId("reason-note").props.value).toBe("gave extra change to T4");
  });

  it("over list, optional under the threshold", () => {
    const { getByText, getByTestId } = render(<Reasons difference={1500} />);
    expect(getByText("What happened? · optional")).toBeTruthy();
    expect(getByTestId("reason-unrecorded_pay_in")).toBeTruthy();
  });

  it("an exact count asks nothing", () => {
    const { queryByTestId } = render(<Reasons difference={0} />);
    expect(queryByTestId("reason-chips")).toBeNull();
  });
});

function Pin(props: { error?: string; lockoutMessage?: string; length?: number }) {
  const [pin, setPin] = useState("");
  return <PinPad value={pin} onChange={setPin} title="Maria, enter your PIN" {...props} />;
}

describe("PinPad", () => {
  it("draws dots only and announces how many are entered", () => {
    const { getByTestId, queryByText } = render(<Pin length={6} />);
    fireEvent.press(getByTestId("pin-key-4"));
    fireEvent.press(getByTestId("pin-key-2"));
    fireEvent.press(getByTestId("pin-key-9"));
    expect(getByTestId("pin-dots").props.accessibilityLabel).toBe("3 of 6 entered");
    expect(queryByText("429")).toBeNull();
    expect(queryByText("4")).toBeTruthy(); // the key face, not an echo
  });

  it("shows the caller's error, and a lockout disables the pad", () => {
    const { getByText, getByTestId, rerender } = render(<Pin error="That PIN didn't work. 2 tries left." />);
    expect(getByText("That PIN didn't work. 2 tries left.")).toBeTruthy();
    rerender(<Pin lockoutMessage="Maria's PIN is locked for 15 minutes. Send to her phone instead." />);
    fireEvent.press(getByTestId("pin-key-1"));
    expect(getByTestId("pin-dots").props.accessibilityLabel).toBe("0 of 6 entered");
  });

  it("nextPin: digits only, never past the max", () => {
    expect(nextPin("12345", "6", 6)).toBe("123456");
    expect(nextPin("123456", "7", 6)).toBe("123456");
    expect(nextPin("12", "backspace", 6)).toBe("1");
    expect(nextPin("12", "00", 6)).toBe("12");
    expect(nextPin("12", "next", 6)).toBe("12");
  });
});

describe("StepBar and CountModeSwitch", () => {
  const STEPS = [
    { key: "count", label: "Count cash" },
    { key: "noncash", label: "GCash & cards", doneLabel: "None today" },
    { key: "result", label: "Result" },
    { key: "remit", label: "Remit" },
  ];

  it("names each step and where the cashier is", () => {
    const { getByTestId, getByText } = render(<StepBar steps={STEPS} currentIndex={2} isCompact={false} />);
    expect(getByTestId("step-bar").props.accessibilityLabel).toBe("Step 3 of 4, Result");
    expect(getByTestId("step-count").props.accessibilityLabel).toBe("Step 1 of 4, Count cash, done");
    expect(getByTestId("step-remit").props.accessibilityLabel).toBe("Step 4 of 4, Remit, to do");
    expect(getByText("None today")).toBeTruthy();
  });

  it("collapses to one line", () => {
    const { getByText } = render(<StepBar steps={STEPS} currentIndex={1} isCompact />);
    expect(getByText("Step 2 of 4 · GCash & cards")).toBeTruthy();
  });

  it("Count bills | Type total", () => {
    function Switch() {
      const [mode, setMode] = useState<CountMode>("bills");
      return <CountModeSwitch value={mode} onChange={setMode} />;
    }
    const { getByLabelText } = render(<Switch />);
    fireEvent.press(getByLabelText("Count by Type total"));
    expect(getByLabelText("Count by Type total").props.accessibilityState).toMatchObject({ selected: true });
  });
});
