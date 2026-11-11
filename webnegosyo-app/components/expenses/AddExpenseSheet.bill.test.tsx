/**
 * "Mark paid" opens the ordinary add sheet as "Pay <bill>": the bill's amount
 * (or Usual / Last chips for a changing one), its category and source picked,
 * and the saved expense carries the bill and its due date.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AddExpenseSheet } from "./AddExpenseSheet";
import { expenseUndoStore } from "../../stores/expense-undo-store";
import { queueExpense } from "../../lib/expenses/live-expense-queue";
import { payForLine, type BillPayContext } from "../../lib/expenses/bills-screen";
import { manilaToday } from "../../lib/expenses/expense-format";
import type { ExpenseCategory } from "../../lib/expenses/types";

const mockSession = { isDemo: false };
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: Object.assign((select: (state: typeof mockSession) => unknown) => select(mockSession), { getState: () => mockSession }),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-community/datetimepicker", () => ({ __esModule: true, default: () => null }));
jest.mock("../../lib/expenses/actor-name", () => ({ readActorName: jest.fn(async () => "Ana") }));
jest.mock("../../lib/expenses/receipt-files", () => ({ captureReceipt: jest.fn(), describeCaptureOutcome: jest.fn() }));
jest.mock("../../lib/expenses/live-expense-queue", () => ({
  queueExpense: jest.fn(async (entry: { payload: unknown }) => ({ id: "kept", ...entry })),
  queueReceipt: jest.fn(async () => {}),
  pendingExpenses: jest.fn(async () => []),
  commitQueuedExpense: jest.fn(async () => ({ sent: new Map(), waiting: 0, refused: 0 })),
  undoExpense: jest.fn(async () => ({ status: "undone" })),
}));

function category(id: string, name: string, group: ExpenseCategory["group"], sortOrder: number): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group, needsNote: false, sortOrder, archivedAt: null };
}
const mockCategories = [
  category("rent", "Rent (Upa)", "occupancy", 10),
  category("electricity", "Kuryente", "utilities", 20),
  category("loan_payment", "Loan payment", "not_expense", 30),
];
jest.mock("../../lib/expenses/use-expenses", () => ({
  useExpenseTenant: () => "t1",
  useExpenseOutlet: () => "branch-viewed",
  useInvalidateExpenses: () => jest.fn(async () => {}),
  useExpenseCategories: () => ({ categories: mockCategories, isLoading: false, error: null }),
  useRecentExpenses: () => ({ expenses: [] }),
  useTracksStock: () => false,
}));

const rent: BillPayContext = {
  billId: "bill-rent",
  dueOn: "2026-10-24",
  name: "Rent",
  amountCents: 1_500_000,
  usualCents: null,
  lastCents: null,
  categoryId: "rent",
  paidFrom: "bank",
  paidToName: "Aling Nena",
  supplierId: null,
  outletId: null,
};
const kuryente: BillPayContext = { ...rent, billId: "bill-k", name: "Kuryente", amountCents: null, usualCents: 610_000, lastCents: 640_000, categoryId: "electricity" };

afterEach(() => {
  const current = expenseUndoStore.getState().current;
  if (current) expenseUndoStore.getState().commit(current.id);
  jest.clearAllMocks();
});

it("opens as Pay Rent with the amount, category and source already in", () => {
  render(<AddExpenseSheet visible mode={{ kind: "book" }} bill={rent} onClose={jest.fn()} />);
  expect(screen.getByText("Pay Rent")).toBeTruthy();
  expect(screen.getByTestId("expense-bill-for").props.children).toBe(payForLine("2026-10-24", manilaToday()));
  expect(screen.getByText("Save ₱15,000 · Rent paid")).toBeTruthy();
  expect(screen.getByLabelText("Rent (Upa)").props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByLabelText("Paid from Bank").props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.queryByTestId("expense-save-next")).toBeNull();
});

it("saves one expense linked to the bill's due date; a store-wide bill keeps the branch being recorded for", async () => {
  const onClose = jest.fn();
  render(<AddExpenseSheet visible mode={{ kind: "book" }} bill={rent} onClose={onClose} />);
  fireEvent.press(screen.getByTestId("expense-save"));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [entry] = jest.mocked(queueExpense).mock.calls[0];
  expect(entry.payload).toMatchObject({
    kind: "book",
    draft: { billId: "bill-rent", billDueOn: "2026-10-24", amountCents: 1_500_000, categoryId: "rent", paidFrom: "bank", outletId: "branch-viewed" },
  });
  expect(screen.queryByTestId("expense-bill-branch")).toBeNull();
});

it("pays a branch bill from that branch, named on the sheet", async () => {
  const onClose = jest.fn();
  const branchRent: BillPayContext = { ...rent, outletId: "branch-katipunan", branchName: "Katipunan" };
  render(<AddExpenseSheet visible mode={{ kind: "book" }} bill={branchRent} onClose={onClose} />);
  expect(screen.getByTestId("expense-bill-branch").props.children).toBe("Branch: Katipunan (this bill's branch)");
  fireEvent.press(screen.getByTestId("expense-save"));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [entry] = jest.mocked(queueExpense).mock.calls[0];
  expect(entry.payload).toMatchObject({ kind: "book", draft: { billId: "bill-rent", outletId: "branch-katipunan" } });
});

it("a changing bill starts empty and offers Usual and Last", () => {
  render(<AddExpenseSheet visible mode={{ kind: "book" }} bill={kuryente} onClose={jest.fn()} />);
  expect(screen.getByText("Type what you paid for Kuryente")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Last ₱6,400"));
  expect(screen.getByText("Save ₱6,400 · Kuryente paid")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Usual ₱6,100"));
  expect(screen.getByText("Save ₱6,100 · Kuryente paid")).toBeTruthy();
});
