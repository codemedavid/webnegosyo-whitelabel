/**
 * The day's deposit (06 §4.5 step 4, W3.1 record_day_deposit(p_cents, p_to,
 * p_ref, p_proof_url)). What is pinned: the amount starts at "cash to
 * deposit"; a different amount is said plainly; Bank needs where it went;
 * Kept in safe records "Safe"; Split records the bank part and says how much
 * stays in the safe; the values fit the column limits (80 characters).
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { DepositBody } from "./DepositBody";
import { DEPOSIT_TEXT_MAX, buildDeposit, depositGapLine } from "./deposit";

describe("deposit rules", () => {
  it("depositGapLine compares with cash to deposit", () => {
    expect(depositGapLine(1985000, 1970000)).toBe("₱150 less than cash to deposit.");
    expect(depositGapLine(1985000, 1990000)).toBe("₱50 more than cash to deposit.");
    expect(depositGapLine(1985000, 1985000)).toBeNull();
  });

  it("bank needs where it went; ref is optional", () => {
    expect(buildDeposit({ mode: "bank", cents: 1985000, bankName: " ", reference: "", cashToDepositCents: 1985000 })).toEqual({
      ok: false,
      message: "Which bank or account did it go to?",
    });
    expect(buildDeposit({ mode: "bank", cents: 1985000, bankName: "BDO savings", reference: " DEP-7731 ", cashToDepositCents: 1985000 })).toEqual({
      ok: true,
      deposit: { cents: 1985000, to: "BDO savings", ref: "DEP-7731" },
    });
  });

  it("kept in safe records Safe", () => {
    expect(buildDeposit({ mode: "safe", cents: 1985000, bankName: "", reference: "", cashToDepositCents: 1985000 })).toEqual({
      ok: true,
      deposit: { cents: 1985000, to: "Safe", ref: null },
    });
  });

  it("split records the bank part and names the rest kept in the safe", () => {
    const split = buildDeposit({ mode: "split", cents: 1500000, bankName: "BDO", reference: "", cashToDepositCents: 1985000 });
    expect(split).toEqual({ ok: true, deposit: { cents: 1500000, to: "BDO; ₱4,850 kept in safe", ref: null } });
    expect(buildDeposit({ mode: "split", cents: 1985000, bankName: "BDO", reference: "", cashToDepositCents: 1985000 })).toEqual({
      ok: false,
      message: "For a split, type the part that went to the bank (less than ₱19,850).",
    });
  });

  it("an amount is needed and long text is cut to the column limit", () => {
    expect(buildDeposit({ mode: "safe", cents: null, bankName: "", reference: "", cashToDepositCents: 100 })).toEqual({ ok: false, message: "Type the amount." });
    const long = buildDeposit({ mode: "bank", cents: 100, bankName: "x".repeat(120), reference: "y".repeat(120), cashToDepositCents: 100 });
    expect(long.ok && long.deposit.to.length).toBe(DEPOSIT_TEXT_MAX);
    expect(long.ok && long.deposit.ref?.length).toBe(DEPOSIT_TEXT_MAX);
  });
});

describe("DepositBody", () => {
  it("starts at cash to deposit and records a bank deposit", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<DepositBody cashToDepositCents={1985000} onSubmit={onSubmit} />);
    expect(getByTestId("deposit-amount").props.accessibilityLabel).toBe("19,850 pesos");
    fireEvent.changeText(getByTestId("deposit-bank"), "BDO savings");
    fireEvent.press(getByTestId("deposit-save"));
    expect(onSubmit).toHaveBeenCalledWith({ cents: 1985000, to: "BDO savings", ref: null });
  });

  it("typing a new amount shows the gap; Kept in safe needs no bank", () => {
    const onSubmit = jest.fn();
    const { getByTestId, getByText, getByLabelText, queryByTestId } = render(<DepositBody cashToDepositCents={1985000} onSubmit={onSubmit} />);
    fireEvent.press(getByLabelText("Deposit Kept in safe"));
    expect(queryByTestId("deposit-bank")).toBeNull();
    fireEvent(getByTestId("deposit-key-backspace"), "longPress");
    for (const key of ["1", "9", "7", "0", "0"]) fireEvent.press(getByTestId(`deposit-key-${key}`));
    expect(getByText("₱150 less than cash to deposit.")).toBeTruthy();
    fireEvent.press(getByTestId("deposit-save"));
    expect(onSubmit).toHaveBeenCalledWith({ cents: 1970000, to: "Safe", ref: null });
  });

  it("shows the refusal instead of saving, and the photo button when offered", () => {
    const onSubmit = jest.fn();
    const onAddPhoto = jest.fn();
    const { getByTestId, getByText } = render(<DepositBody cashToDepositCents={1985000} onSubmit={onSubmit} onAddPhoto={onAddPhoto} />);
    fireEvent.press(getByTestId("deposit-save"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByText("Which bank or account did it go to?")).toBeTruthy();
    fireEvent.press(getByTestId("deposit-photo"));
    expect(onAddPhoto).toHaveBeenCalled();
  });

  it("offline: nothing is saved", () => {
    const onSubmit = jest.fn();
    const { getByTestId, getByText } = render(<DepositBody cashToDepositCents={100} onSubmit={onSubmit} isOffline />);
    expect(getByText("Recording a deposit needs a connection.")).toBeTruthy();
    fireEvent.press(getByTestId("deposit-save"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
