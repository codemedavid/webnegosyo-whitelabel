import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ExpenseCategoriesScreen from "../../../app/(main)/expense-categories";
import { archiveCategory, saveCategory } from "../../../lib/expenses/expense-service";
import type { ExpenseCategory } from "../../../lib/expenses/types";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../lib/expenses/expense-client", () => ({ liveExpenseDb: {} }));
jest.mock("../../../lib/expenses/expense-service", () => ({
  saveCategory: jest.fn(),
  archiveCategory: jest.fn(),
}));

function category(overrides: Partial<ExpenseCategory> & { id: string; name: string }): ExpenseCategory {
  return { tenantId: "t1", systemKey: null, icon: null, group: "operating", needsNote: false, sortOrder: 0, archivedAt: null, ...overrides };
}

const ICE = category({ id: "ice", name: "Ice (Yelo)", group: "ingredients", systemKey: "ice", sortOrder: 10 });
const GAS = category({ id: "gas", name: "Gas", group: "ingredients", sortOrder: 20 });
const OLD = category({ id: "old", name: "Charcoal", group: "ingredients", sortOrder: 30, archivedAt: "2026-11-01T00:00:00Z" });

const mockAccess = { canManage: true };
const mockInvalidate = jest.fn(async () => {});
const mockRefetch = jest.fn(async () => {});
let mockCategories: ExpenseCategory[] = [ICE, GAS, OLD];
jest.mock("../../../lib/expenses/use-expenses", () => ({
  useCanManageCategories: () => mockAccess.canManage,
  useExpenseTenant: () => "t1",
  useInvalidateExpenseCategories: () => mockInvalidate,
  useAllExpenseCategories: () => ({ data: mockCategories, categories: mockCategories, error: null, refetch: mockRefetch }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.canManage = true;
  mockCategories = [ICE, GAS, OLD];
});

it("is locked for an account that may not change categories (branch-locked or no `expenses`)", () => {
  mockAccess.canManage = false;
  const screen = render(<ExpenseCategoriesScreen />);
  expect(screen.getByText("Categories are locked")).toBeTruthy();
  expect(screen.queryByTestId("category-manage-ice")).toBeNull();
});

it("lists live categories by group, with archived ones folded", () => {
  const screen = render(<ExpenseCategoriesScreen />);
  expect(screen.getByTestId("category-manage-ice")).toBeTruthy();
  expect(screen.getByTestId("category-manage-gas")).toBeTruthy();
  expect(screen.queryByTestId("category-manage-old")).toBeNull();
  expect(screen.getByText("Food and drink cost")).toBeTruthy();
  fireEvent.press(screen.getByTestId("categories-toggle-archived"));
  expect(screen.getByTestId("category-restore-old")).toBeTruthy();
});

it("adds a category at the end of its group", async () => {
  jest.mocked(saveCategory).mockResolvedValueOnce(category({ id: "new", name: "Uling", group: "ingredients", sortOrder: 40 }));
  const screen = render(<ExpenseCategoriesScreen />);
  fireEvent.press(screen.getAllByText("Add")[0]);
  fireEvent.changeText(screen.getByLabelText("Category name"), "  Uling ");
  fireEvent.press(screen.getByTestId("category-save"));
  await waitFor(() =>
    expect(saveCategory).toHaveBeenCalledWith({}, "t1", { id: undefined, name: "Uling", group: "ingredients", needsNote: false, sortOrder: 40 }),
  );
  await waitFor(() => expect(screen.getByTestId("categories-notice").props.children).toBe("Added Uling to Ingredients."));
  expect(screen.getByTestId("category-manage-new")).toBeTruthy();
  expect(mockInvalidate).toHaveBeenCalled();
});

it("refuses a taken name before sending anything", () => {
  const screen = render(<ExpenseCategoriesScreen />);
  fireEvent.press(screen.getAllByText("Add")[0]);
  fireEvent.changeText(screen.getByLabelText("Category name"), "gas");
  fireEvent.press(screen.getByTestId("category-save"));
  expect(screen.getByText("There is already a category with that name.")).toBeTruthy();
  expect(saveCategory).not.toHaveBeenCalled();
});

it("keeps a starter's group fixed and says why", () => {
  const screen = render(<ExpenseCategoriesScreen />);
  fireEvent.press(screen.getByTestId("category-manage-ice"));
  expect(screen.queryByTestId("category-group-staff")).toBeNull();
  expect(screen.getByText(/Starter categories keep their group/)).toBeTruthy();
});

it("shows the database's refusal in words and keeps the sheet open", async () => {
  jest.mocked(saveCategory).mockRejectedValueOnce(new Error("This category already has expenses, so its group stays."));
  const screen = render(<ExpenseCategoriesScreen />);
  fireEvent.press(screen.getByTestId("category-manage-gas"));
  fireEvent.press(screen.getByTestId("category-group-utilities"));
  fireEvent.press(screen.getByTestId("category-save"));
  await waitFor(() => expect(screen.getByText("This category already has expenses, so its group stays.")).toBeTruthy());
  expect(screen.getByTestId("category-save")).toBeTruthy();
});

it("puts a category moved to another group at the end of that group", async () => {
  mockCategories = [ICE, GAS, category({ id: "fuel", name: "Fuel", group: "utilities", sortOrder: 110 })];
  jest.mocked(saveCategory).mockResolvedValueOnce({ ...GAS, group: "utilities", sortOrder: 120 });
  const screen = render(<ExpenseCategoriesScreen />);
  fireEvent.press(screen.getByTestId("category-manage-gas"));
  fireEvent.press(screen.getByTestId("category-group-utilities"));
  fireEvent.press(screen.getByTestId("category-save"));
  await waitFor(() => expect(saveCategory).toHaveBeenCalled());
  expect(jest.mocked(saveCategory).mock.calls[0][2]).toMatchObject({ id: "gas", group: "utilities", sortOrder: 120 });
});

it("moves a category up by swapping sort orders with its neighbour", async () => {
  jest.mocked(saveCategory).mockImplementation(async (_db, _tenant, input) => category({ ...GAS, ...input, id: input.id as string }));
  const screen = render(<ExpenseCategoriesScreen />);
  fireEvent.press(screen.getByTestId("category-manage-gas"));
  fireEvent.press(screen.getByTestId("category-move-up"));
  await waitFor(() => expect(saveCategory).toHaveBeenCalledTimes(2));
  const sent = jest.mocked(saveCategory).mock.calls.map(([, , input]) => [input.id, input.sortOrder]);
  expect(sent).toEqual([
    ["gas", 10],
    ["ice", 20],
  ]);
});

it("archives and restores, never deletes", async () => {
  jest.mocked(archiveCategory)
    .mockResolvedValueOnce({ ...GAS, archivedAt: "2026-11-27T00:00:00Z" })
    .mockResolvedValueOnce({ ...OLD, archivedAt: null });
  const screen = render(<ExpenseCategoriesScreen />);
  fireEvent.press(screen.getByTestId("category-manage-gas"));
  fireEvent.press(screen.getByTestId("category-archive"));
  await waitFor(() => expect(archiveCategory).toHaveBeenCalledWith({}, "t1", "gas", true));
  await waitFor(() => expect(screen.queryByTestId("category-manage-gas")).toBeNull());

  fireEvent.press(screen.getByTestId("categories-toggle-archived"));
  fireEvent.press(screen.getByTestId("category-restore-old"));
  await waitFor(() => expect(archiveCategory).toHaveBeenCalledWith({}, "t1", "old", false));
  await waitFor(() => expect(screen.getByTestId("category-manage-old")).toBeTruthy());
});
