import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { BillGlance } from "../../lib/expenses/money-glance-bills";
import type { StillToPay } from "../../lib/expenses/bill-schedule";
import type { ProfitGlance } from "../../lib/profit/profit-service";
import { useBillGlance, useBillsStillToPay } from "../../lib/expenses/use-bill-glance";
import { useKeptThisMonth } from "../../lib/expenses/money-glance-hooks";
import { HomeMoneyCard } from "./HomeMoneyCard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../lib/expenses/money-glance-hooks", () => ({
  useSpentToday: jest.fn(() => null),
  useKeptThisMonth: jest.fn(() => null),
  useKeptThisMonthBranch: jest.fn(() => ({ outletId: null, unassigned: false })),
}));
jest.mock("../../lib/expenses/use-expenses", () => ({ useUnsortedPayouts: jest.fn(() => ({ payouts: [] })) }));
jest.mock("../../lib/expenses/use-bill-glance", () => ({
  useBillGlance: jest.fn(() => null),
  useBillsStillToPay: jest.fn(() => null),
}));

const OWNER = { canSeeExpenses: true, canSeeProfitRow: true, canSeeKept: true };
const CASHIER = { canSeeExpenses: false, canSeeProfitRow: false, canSeeKept: false };
const lateRent: BillGlance = { billId: "bill-rent", title: "Rent is 2 days late", detail: "₱15,000 · 2 more bills this week", isLate: true };
const kept: ProfitGlance = { profitCents: 3_700_000, ratios: { profit: 0.3 }, isPartial: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useBillGlance).mockReturnValue(null);
  jest.mocked(useBillsStillToPay).mockReturnValue(null);
  jest.mocked(useKeptThisMonth).mockReturnValue(null);
});

describe("HomeMoneyCard bills", () => {
  test("a late bill gets a row with Pay that opens that bill", () => {
    // Arrange
    jest.mocked(useBillGlance).mockReturnValue(lateRent);

    // Act
    render(<HomeMoneyCard access={OWNER} />);
    fireEvent.press(screen.getByTestId("home-money-bill"));

    // Assert
    expect(screen.getByText("Rent is 2 days late")).toBeTruthy();
    expect(screen.getByText("₱15,000 · 2 more bills this week")).toBeTruthy();
    expect(screen.getByText("Pay")).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith("/(main)/expense-bills?bill=bill-rent");
  });

  test("bills are read only for an account with the expenses key", () => {
    render(<HomeMoneyCard access={CASHIER} />);

    expect(jest.mocked(useBillGlance)).toHaveBeenCalledWith(false);
    expect(jest.mocked(useBillsStillToPay).mock.calls[0][0]).toBe(false);
    expect(screen.queryByTestId("home-money-bill")).toBeNull();
  });

  test("nothing due soon: no bill row", () => {
    jest.mocked(useKeptThisMonth).mockReturnValue(kept);
    render(<HomeMoneyCard access={OWNER} />);
    expect(screen.queryByTestId("home-money-bill")).toBeNull();
    expect(screen.getByText("Kept this month ₱37,000")).toBeTruthy();
  });

  test("Kept this month says what is left once the bills are paid", () => {
    // Arrange
    const still: StillToPay = { cents: 1_620_000, count: 2, hasEstimate: true };
    jest.mocked(useKeptThisMonth).mockReturnValue(kept);
    jest.mocked(useBillsStillToPay).mockReturnValue(still);

    // Act
    render(<HomeMoneyCard access={OWNER} />);

    // Assert
    expect(screen.getByText("If you pay the 2 bills left: about ₱20,800 kept")).toBeTruthy();
  });

  test("with every bill paid, Kept keeps its usual line", () => {
    jest.mocked(useKeptThisMonth).mockReturnValue(kept);
    jest.mocked(useBillsStillToPay).mockReturnValue({ cents: 0, count: 0, hasEstimate: false });

    render(<HomeMoneyCard access={OWNER} />);

    expect(screen.getByText("30% of sales · Profit")).toBeTruthy();
  });
});
