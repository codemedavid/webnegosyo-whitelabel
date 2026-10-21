import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";

import ProfitScreen from "../../app/(main)/profit";
import { toExpenseCategoryTotals, toProfitFigures } from "./profit-rows";
import { composeProfit, type ProfitScreenData } from "./profit-service";
import { resolveProfitWindow } from "./profit-period";
import { useProfit } from "./use-profit";

const mockSession = {
  role: "admin",
  isOwner: true,
  permissions: null as string[] | null,
  orderBackend: "platform" as string | null,
  outletId: null as string | null,
  outletName: null as string | null,
};
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: Object.assign((select: (state: typeof mockSession) => unknown) => select(mockSession), { getState: () => mockSession }),
}));
jest.mock("../../stores/branch-context-store", () => {
  const state = { selectedOutletId: null };
  return { useBranchContextStore: (select: (s: typeof state) => unknown) => select(state) };
});
jest.mock("../use-branch-scope", () => ({ useAccountBranchScope: () => ({ kind: "all" }) }));
jest.mock("../use-outlets", () => ({ useOutlets: () => ({ outlets: [] }) }));
jest.mock("./use-profit", () => ({ useProfit: jest.fn() }));

const summary = {
  orders: 10, net_sales_cents: 1_000_000, collected_cents: 1_000_000, sale_movements: 0, ledger_cogs_cents: 0, fallback_cogs_cents: 0,
  fallback_orders: 0, waste_cents: 0, count_variance_cents: 0, uncosted_movements: 0, sold_quantity: 0, costed_quantity: 0,
  sold_dishes: 0, costed_dishes: 0, dish_costs_visible: true, ingredients_cents: 400_000, ingredient_stock_cents: 0,
  staff_cents: 300_000, occupancy_cents: 500_000, utilities_cents: 0, operating_cents: 0, admin_cents: 0, other_cents: 0,
  capex_cents: 0, not_expense_cents: 0, expense_count: 3, store_wide_expense_cents: 0, unsorted_payouts: 0, unsorted_payout_cents: 0,
};
const rent = { category_id: "rent", name: "Rent (Upa)", icon: "RE", category_group: "occupancy", system_key: "rent", cents: 500_000, stock_purchase_cents: 0, expenses: 1 };

function ready(overrides: Partial<typeof summary> = {}): ProfitScreenData {
  return composeProfit(resolveProfitWindow({ preset: "this_month" }, Date.now()), {
    summary: { ok: true, data: toProfitFigures([{ ...summary, ...overrides }]) },
    categories: { ok: true, data: toExpenseCategoryTotals([rent]) },
    previousCategories: null,
    periods: null,
  });
}

function answer(data: ProfitScreenData | undefined) {
  jest.mocked(useProfit).mockReturnValue({
    data,
    isLoading: data === undefined,
    error: null,
    refetch: jest.fn(async () => {}),
    isRefetching: false,
    dataUpdatedAt: 1,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.isOwner = true;
  mockSession.permissions = null;
  mockSession.orderBackend = "platform";
});

it("is locked, without reading, for staff missing the costs key", () => {
  mockSession.isOwner = false;
  mockSession.permissions = ["reports", "expenses"];
  answer(undefined);

  const screen = render(<ProfitScreen />);

  expect(screen.getByText("Ask the owner for cost access to see profit.")).toBeTruthy();
  expect(jest.mocked(useProfit).mock.calls[0][2]).toBe(false);
});

it("is locked when the database refuses, whatever the phone thought", () => {
  answer({ status: "locked", message: "Ask the owner for cost access to see profit." });
  expect(render(<ProfitScreen />).getByText("Ask the owner for cost access to see profit.")).toBeTruthy();
});

it("explains itself on a store that is not on the platform backend", () => {
  mockSession.orderBackend = "convex";
  answer(undefined);
  const screen = render(<ProfitScreen />);
  expect(screen.getByText(/new order system/)).toBeTruthy();
  expect(jest.mocked(useProfit).mock.calls[0][2]).toBe(false);
});

it("says the sentence, and a loss in words", () => {
  answer(ready());
  const screen = render(<ProfitScreen />);
  expect(screen.getByText("Sales (Benta)")).toBeTruthy();
  // ₱10,000 − ₱4,000 − ₱8,000 = −₱2,000.
  expect(screen.getByText("−₱2,000")).toBeTruthy();
  expect(screen.getByText("Lugi (loss) · −₱2,000 · 20% of sales")).toBeTruthy();
  expect(screen.getByText("Ingredients + Staff = 70% of sales")).toBeTruthy();
});

it("opens the expense book on the category a bar stands for", () => {
  answer(ready());
  const screen = render(<ProfitScreen />);
  fireEvent.press(screen.getByLabelText(/^Rent, ₱5,000/));
  expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/\(main\)\/expenses\?category=rent&month=\d{4}-\d{2}$/));
});

it("greets a store with no expenses yet and records the first one", () => {
  answer(ready({ expense_count: 0 }));
  const screen = render(<ProfitScreen />);
  expect(screen.getByText("Profit = Sales − Ingredients − Expenses")).toBeTruthy();
  fireEvent.press(screen.getAllByText("Add expense")[0]);
  expect(router.push).toHaveBeenCalledWith("/(main)/expenses?add=1");
});
