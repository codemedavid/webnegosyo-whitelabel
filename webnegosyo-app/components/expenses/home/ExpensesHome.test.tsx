/**
 * The Expenses home pieces as a person (and a screen reader) meets them: a
 * row says what still needs a look under its amount, "Needs you" is absent
 * when nothing does, and the filter pills carry the "Check these" count.
 */
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { HOME_CATEGORIES, homeExpense, homeQueued } from "../../../lib/expenses/expenses-home-fixtures";
import { needsYouItems } from "../../../lib/expenses/expenses-home-needs";
import { buildHomeRows, type BuildRowsInput } from "../../../lib/expenses/expenses-home-rows";
import { homeTotals } from "../../../lib/expenses/expenses-home-rows";
import { ExpenseRow } from "../ExpenseRow";
import { ExpensesHero } from "./ExpensesHero";
import { HomeFilterPills } from "./HomeFilterPills";
import { NeedsYouCard } from "./NeedsYouCard";

function rowsOf(overrides: Partial<BuildRowsInput>) {
  return buildHomeRows({
    expenses: [],
    queued: [],
    categories: HOME_CATEGORIES,
    flagsById: {},
    waitingReceipts: new Set(),
    window: { from: "2026-10-01", to: "2026-10-31" },
    ...overrides,
  });
}

describe("ExpenseRow", () => {
  it("shows the amount in ink without a minus, and says when a receipt is missing", () => {
    const [row] = rowsOf({ expenses: [homeExpense({ id: "a", amountCents: 118_000, note: "LPG 11kg" })], flagsById: { a: ["no_receipt"] } });
    const onPress = jest.fn();

    render(<ExpenseRow row={row} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));

    expect(screen.getByText("₱1,180")).toBeTruthy();
    expect(screen.getByText("No receipt")).toBeTruthy();
    expect(onPress).toHaveBeenCalledWith(row);
  });

  it("strikes a voided row and says so", () => {
    const [row] = rowsOf({ expenses: [homeExpense({ id: "v", status: "void" })] });

    render(<ExpenseRow row={row} onPress={() => {}} />);

    expect(screen.getByText("Voided")).toBeTruthy();
  });

  it("tells the owner a refused entry was not sent", () => {
    const [row] = rowsOf({ queued: [homeQueued({ id: "q", refusedReason: "Category removed" })] });

    render(<ExpenseRow row={row} onPress={() => {}} />);

    expect(screen.getByText("Not sent — tap")).toBeTruthy();
  });

  it("tags cash that was only moved", () => {
    const [row] = rowsOf({ expenses: [homeExpense({ id: "d", categoryId: "owner_draw" })] });

    render(<ExpenseRow row={row} onPress={() => {}} />);

    expect(screen.getByText("Cash moved")).toBeTruthy();
  });
});

describe("NeedsYouCard", () => {
  it("draws nothing when nothing needs the owner", () => {
    render(<NeedsYouCard items={[]} onAction={() => {}} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hands the tapped item back", () => {
    const items = needsYouItems({ rows: [], unsortedCount: 2, unsortedCents: 50_000 });
    const onAction = jest.fn();

    render(<NeedsYouCard items={items} onAction={onAction} />);
    fireEvent.press(screen.getByRole("button", { name: "Choose" }));

    expect(screen.getByText("2 drawer pay-outs need a category")).toBeTruthy();
    expect(onAction).toHaveBeenCalledWith(items[0]);
  });
});

describe("HomeFilterPills", () => {
  it("shows the Check these count and switches the view", () => {
    const onView = jest.fn();

    render(<HomeFilterPills view="all" checkCount={3} categoryLabel={null} onView={onView} onCategory={() => {}} />);
    fireEvent.press(screen.getByRole("button", { name: "Check these, 3" }));

    expect(screen.getByText("3")).toBeTruthy();
    expect(onView).toHaveBeenCalledWith("check");
  });

  it("gives every pill a 44pt target that still grows with large text", () => {
    render(<HomeFilterPills view="all" checkCount={0} categoryLabel={null} onView={() => {}} onCategory={() => {}} />);

    for (const pill of screen.getAllByRole("button")) {
      const style = StyleSheet.flatten(pill.props.style);
      const slop = pill.props.hitSlop ?? { top: 0, bottom: 0 };
      expect(style.height).toBeUndefined();
      expect(style.minHeight + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    }
  });

  it("names the chosen category on its pill", () => {
    const onCategory = jest.fn();

    render(<HomeFilterPills view="all" checkCount={0} categoryLabel="Yelo" onView={() => {}} onCategory={onCategory} />);
    fireEvent.press(screen.getByRole("button", { name: "Category: Yelo. Change" }));

    expect(onCategory).toHaveBeenCalledTimes(1);
  });
});

describe("ExpensesHero", () => {
  const props = {
    eyebrow: "Spent in October",
    monthShort: "Oct",
    totals: homeTotals([]),
    change: null,
    clearLabel: null,
    onClear: () => {},
    today: { cents: 0, count: 0 },
    kept: null,
    onOpenProfit: () => {},
    isTruncated: false,
    canGoNext: false,
    onPrevious: jest.fn(),
    onNext: () => {},
  };

  it("shows no figure for a month that failed, but keeps the month arrows", () => {
    // Arrange
    const onPrevious = jest.fn();

    // Act
    render(<ExpensesHero {...props} state="failed" onPrevious={onPrevious} />);
    fireEvent.press(screen.getByRole("button", { name: "Previous month" }));

    // Assert
    expect(screen.queryByTestId("expenses-hero-total")).toBeNull();
    expect(screen.getByText("Not loaded")).toBeTruthy();
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it("shows the total once the month is in", () => {
    render(<ExpensesHero {...props} state="ready" />);

    expect(screen.getByTestId("expenses-hero-total")).toBeTruthy();
  });
});
