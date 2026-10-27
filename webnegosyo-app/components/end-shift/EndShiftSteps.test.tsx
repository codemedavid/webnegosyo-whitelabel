import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { BLIND_HINT, COUNT_HINT, CountStep, RemitStep, ResultStep, countHint } from "./EndShiftSteps";
import { emptyDraft, type EndShiftDraft } from "../../lib/cash/shift-end-flow";
import type { ShiftClosePreview, ShiftCountResult } from "../../lib/cash/shift-close-parse";

const PREVIEW: ShiftClosePreview = {
  source: "server",
  hidden: false,
  expectedCents: 846500,
  breakdown: null,
  nonCashByMethod: [],
  floatCents: 200000,
  isZeroBalance: false,
  countAttempts: 0,
};

const SHORT: ShiftCountResult = { attempt: 1, countedCents: 834500, expectedCents: 846500, differenceCents: -12000, source: "server", reasonRequired: true };

function resultProps(overrides: Partial<React.ComponentProps<typeof ResultStep>> = {}): React.ComponentProps<typeof ResultStep> {
  return {
    count: SHORT,
    reasonKey: null,
    note: "",
    onReason: jest.fn(),
    onNote: jest.fn(),
    reasonError: null,
    thresholdCents: 2000,
    isZeroBalance: false,
    floatKeptCents: 200000,
    handoverCents: 634500,
    onFloatKept: jest.fn(),
    ...overrides,
  };
}

describe("countHint", () => {
  it("says the expected figure only when the store shows it", () => {
    expect(countHint(PREVIEW)).toBe("Should be ₱8,465");
    expect(countHint({ ...PREVIEW, hidden: true, expectedCents: null })).toBe(BLIND_HINT);
    expect(countHint(null)).toBe(COUNT_HINT);
  });
});

describe("CountStep", () => {
  it("types a total on its own keypad, in centavos", () => {
    let draft: EndShiftDraft = { ...emptyDraft("s1", "total") };
    const onChange = (change: (d: EndShiftDraft) => EndShiftDraft) => {
      draft = change(draft);
    };
    render(<CountStep draft={draft} preview={PREVIEW} onChange={onChange} isTablet={false} onDone={jest.fn()} />);
    expect(screen.getByTestId("end-shift-typed")).toBeTruthy();
    fireEvent.press(screen.getByTestId("end-shift-key-8"));
    fireEvent.press(screen.getByTestId("end-shift-key-00"));
    expect(draft.typedCents).toBe(80000);
  });
});

describe("ResultStep", () => {
  it("shows the verdict, asks what happened on a difference and offers a recount", () => {
    const onRecount = jest.fn();
    render(<ResultStep {...resultProps({ onRecount })} />);
    expect(screen.getAllByText(/Short/).length).toBeGreaterThan(0);
    expect(screen.getByText("Wrong sukli (change)")).toBeTruthy();
    expect(screen.getByText(/Remit ₱6,345\./)).toBeTruthy();
    fireEvent.press(screen.getByText("Recount"));
    expect(onRecount).toHaveBeenCalled();
  });

  it("asks nothing when the drawer is exact", () => {
    render(<ResultStep {...resultProps({ count: { ...SHORT, countedCents: 846500, differenceCents: 0, reasonRequired: false } })} />);
    expect(screen.queryByText("Wrong sukli (change)")).toBeNull();
  });

  it("says a zero-balance drawer ends empty", () => {
    render(<ResultStep {...resultProps({ isZeroBalance: true, floatKeptCents: 0 })} />);
    expect(screen.getByText("Remit all ₱8,345. This drawer ends empty.")).toBeTruthy();
  });

  it("refuses keeping more float than was counted", () => {
    const onFloatKept = jest.fn();
    render(<ResultStep {...resultProps({ onFloatKept })} />);
    fireEvent.press(screen.getByText("Keep ₱2,000 · change"));
    fireEvent.changeText(screen.getByLabelText("Float to keep for the next shift"), "9000");
    expect(screen.getByText("You can't keep more than you counted.")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Float to keep for the next shift"), "3000");
    fireEvent.press(screen.getByText("Keep this"));
    expect(onFloatKept).toHaveBeenCalledWith(300000);
  });
});

describe("RemitStep", () => {
  it("just ends the shift when the store records no receiver", () => {
    render(
      <RemitStep
        receivers={[]}
        receiversError={null}
        target={null}
        onTarget={jest.fn()}
        how="phone"
        onHow={jest.fn()}
        isOffline={false}
        handoverCents={634500}
        isRemitOff
      />,
    );
    expect(screen.getByText("Hand over ₱6,345")).toBeTruthy();
  });

  it("asks who is receiving it", () => {
    render(
      <RemitStep
        receivers={[{ userId: "u1", name: "Maria", roleLabel: "Owner", presence: "On shift now" }]}
        receiversError={null}
        target={null}
        onTarget={jest.fn()}
        how="phone"
        onHow={jest.fn()}
        isOffline={false}
        handoverCents={634500}
        isRemitOff={false}
      />,
    );
    expect(screen.getByText("Who is receiving it?")).toBeTruthy();
    expect(screen.getByText("Maria")).toBeTruthy();
  });
});
