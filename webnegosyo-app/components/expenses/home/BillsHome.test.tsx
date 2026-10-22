/**
 * Bills on the Expenses home: the hero says what is still to pay, the card
 * lists the next few late first with a pay button each, and a store without
 * bills gets one quiet line, never a big card.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { BILL_CATEGORIES, BILL_TODAY, billOf } from "../../../lib/expenses/bills-fixtures";
import { buildBillsView, stillToPayLine } from "../../../lib/expenses/bills-screen";
import { BillsCard, BillsDoor } from "./BillsCard";
import { ExpensesHero } from "./ExpensesHero";

const categories = new Map(BILL_CATEGORIES.map((category) => [category.id, category]));
const bills = [
  billOf({ id: "rent", name: "Rent", rule: { kind: "monthly", day: 24 }, startsOn: "2026-10-01" }),
  billOf({ id: "water", name: "Tubig", categoryId: "water", amountCents: 84_000, rule: { kind: "monthly", day: 20 }, startsOn: "2026-10-01" }),
  billOf({ id: "net", name: "Internet", categoryId: "internet", amountCents: 169_900, rule: { kind: "monthly", day: 28 }, startsOn: "2026-10-01" }),
  billOf({ id: "lpg", name: "LPG", categoryId: "lpg", amountCents: 105_000, rule: { kind: "monthly", day: 30 }, startsOn: "2026-10-01" }),
];
const view = buildBillsView({ bills, payments: [], marks: [], today: BILL_TODAY });

const heroProps = {
  eyebrow: "Spent in October",
  monthShort: "Oct",
  totals: { spentCents: 0, cashMovedCents: 0, split: [] } as never,
  change: null,
  clearLabel: null,
  onClear: jest.fn(),
  today: null,
  kept: null,
  onOpenProfit: jest.fn(),
  isTruncated: false,
  canGoNext: false,
  onPrevious: jest.fn(),
  onNext: jest.fn(),
};

describe("hero line", () => {
  it("says what is still to pay this month and opens Bills to pay", () => {
    const onPress = jest.fn();
    const text = stillToPayLine(view.still)!;
    render(<ExpensesHero {...heroProps} bills={{ text, onPress }} />);

    expect(screen.getByText("₱18,589 still to pay · 4 bills")).toBeTruthy();
    fireEvent.press(screen.getByTestId("expenses-hero-bills"));
    expect(onPress).toHaveBeenCalled();
  });

  it("is absent when nothing is open", () => {
    render(<ExpensesHero {...heroProps} bills={null} />);
    expect(screen.queryByTestId("expenses-hero-bills")).toBeNull();
  });
});

describe("BillsCard", () => {
  it("lists three, late first, each with its own pay button, and links to all of them", () => {
    const onPay = jest.fn();
    const onSeeAll = jest.fn();
    render(<BillsCard rows={view.open} categories={categories} onOpen={jest.fn()} onPay={onPay} onSeeAll={onSeeAll} />);

    expect(screen.getByLabelText("Pay: Tubig")).toBeTruthy();
    expect(screen.getByLabelText("Mark paid: Rent")).toBeTruthy();
    expect(screen.getByLabelText("Mark paid: Internet")).toBeTruthy();
    expect(screen.queryByText("LPG")).toBeNull();
    expect(screen.getByText("2 days late")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Pay: Tubig"));
    expect(onPay).toHaveBeenCalledWith(expect.objectContaining({ bill: expect.objectContaining({ id: "water" }) }));
    fireEvent.press(screen.getByLabelText("See all 4: Bills to pay"));
    expect(onSeeAll).toHaveBeenCalled();
  });

  it("draws nothing when no bill is open", () => {
    render(<BillsCard rows={[]} categories={categories} onOpen={jest.fn()} onPay={jest.fn()} onSeeAll={jest.fn()} />);
    expect(screen.queryByText("Bills to pay")).toBeNull();
  });
});

it("a store without bills gets one quiet line", () => {
  const onPress = jest.fn();
  render(<BillsDoor onPress={onPress} />);
  fireEvent.press(screen.getByText("Set up bills you pay every month"));
  expect(onPress).toHaveBeenCalled();
});
