/**
 * The voucher ticket: what a merchant reads off the list at a glance — the
 * deal, the code, whether it is running, and how much of it is left.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { VoucherTicket } from "./VoucherTicket";
import type { Voucher } from "../../lib/vouchers/types";

const NOW = new Date(2026, 8, 26, 12, 0, 0);

function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: "v1",
    code: "SAVE20",
    name: "Launch week",
    discountType: "percent",
    discountValue: 20,
    maxDiscountAmount: null,
    minOrderAmount: 0,
    scope: "universal",
    isStackable: false,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    usedCount: 0,
    startsAt: null,
    endsAt: null,
    channels: ["checkout", "pos", "admin"],
    outletIds: null,
    isActive: true,
    ...overrides,
  };
}

describe("VoucherTicket", () => {
  it("shows the deal, the code, the name and that it is live", () => {
    render(<VoucherTicket voucher={voucher()} now={NOW} />);
    expect(screen.getByText("20%")).toBeTruthy();
    expect(screen.getByText("OFF")).toBeTruthy();
    expect(screen.getByText("SAVE20")).toBeTruthy();
    expect(screen.getByText("Launch week")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("Not used yet")).toBeTruthy();
  });

  it("counts down what is left of a limited code", () => {
    render(<VoucherTicket voucher={voucher({ usageLimitTotal: 50, usedCount: 12 })} now={NOW} />);
    expect(screen.getByText("38 left")).toBeTruthy();
  });

  it("says a spent code is used up rather than live", () => {
    render(<VoucherTicket voucher={voucher({ usageLimitTotal: 5, usedCount: 5 })} now={NOW} />);
    expect(screen.getByText("Used up")).toBeTruthy();
    expect(screen.getByText("All used")).toBeTruthy();
  });

  it("marks a switched-off code", () => {
    render(<VoucherTicket voucher={voucher({ isActive: false })} now={NOW} />);
    expect(screen.getByText("Switched off")).toBeTruthy();
  });

  it("shows a placeholder while the editor has no code yet", () => {
    render(<VoucherTicket voucher={voucher({ code: "" })} now={NOW} codePlaceholder="YOURCODE" />);
    expect(screen.getByText("YOURCODE")).toBeTruthy();
  });

  it("opens when tapped", () => {
    const onPress = jest.fn();
    render(<VoucherTicket voucher={voucher()} now={NOW} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
