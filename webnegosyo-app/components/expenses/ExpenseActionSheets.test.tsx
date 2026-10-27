/**
 * The Change sheet: it always shows what the expense is filed under (even a
 * category the store has since archived), and Android back steps from "All
 * categories" to the form instead of throwing the edit away.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { CURRENT_CATEGORY_NAME } from "../../lib/expenses/expense-detail-sheets";
import type { Expense, ExpenseCategory } from "../../lib/expenses/types";
import { ChangeExpenseSheet } from "./ExpenseActionSheets";

function category(id: string, name: string): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group: "utilities", needsNote: false, sortOrder: 0, archivedAt: null };
}
const categories = [category("lpg", "Gas / LPG"), ...Array.from({ length: 8 }, (_, index) => category(`extra-${index}`, `Extra ${index}`))];

const expense = {
  id: "e1",
  categoryId: "lpg",
  note: "LPG 11kg",
  amountCents: 118_000,
  paidFrom: "cash",
  status: "recorded",
} as Expense;

function pressBack() {
  const { Modal: NativeModal } = jest.requireActual("react-native") as typeof import("react-native");
  act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());
}

it("shows an archived current category as the chosen one", () => {
  // Arrange: the store's list no longer carries "old-cat".
  render(<ChangeExpenseSheet expense={{ ...expense, categoryId: "old-cat" }} categories={categories} onConfirm={jest.fn()} onClose={jest.fn()} />);

  // Assert
  const current = screen.getByLabelText(CURRENT_CATEGORY_NAME);
  expect(current.props.accessibilityState).toMatchObject({ selected: true });
});

it("Android back steps from all categories to the form, keeping the edit", () => {
  const onClose = jest.fn();
  render(<ChangeExpenseSheet expense={expense} categories={categories} onConfirm={jest.fn()} onClose={onClose} />);
  fireEvent.changeText(screen.getByLabelText("Note"), "LPG 2 tanks");
  fireEvent.press(screen.getByTestId("category-all"));
  expect(screen.getByText("Pick a category")).toBeTruthy();

  pressBack();

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("LPG 2 tanks")).toBeTruthy();
});
