import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";

import ProfitScreen from "../../app/(main)/profit";
import { toExpenseCategoryTotals, toProfitFigures } from "./profit-rows";
import { composeProfit, type ProfitScreenData } from "./profit-service";
import { resolveProfitWindow } from "./profit-period";
import type { ProfitPeriodFigures } from "./profit-types";
import { useProfit } from "./use-profit";
import { useProfitBills, type ProfitBills } from "./use-profit-bills";

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
jest.mock("./use-profit-bills", () => ({ useProfitBills: jest.fn() }));

const NO_BILLS: ProfitBills = { findings: null, still: null };

const summary = {
  orders: 10, net_sales_cents: 1_000_000, collected_cents: 1_000_000, sale_movements: 0, ledger_cogs_cents: 0, fallback_cogs_cents: 0,
  fallback_orders: 0, waste_cents: 0, count_variance_cents: 0, uncosted_movements: 0, sold_quantity: 0, costed_quantity: 0,
  sold_dishes: 0, costed_dishes: 0, dish_costs_visible: true, ingredients_cents: 400_000, ingredient_stock_cents: 0,
  staff_cents: 300_000, occupancy_cents: 500_000, utilities_cents: 0, operating_cents: 0, admin_cents: 0, other_cents: 0,
  capex_cents: 0, not_expense_cents: 0, expense_count: 3, store_wide_expense_cents: 0, unsorted_payouts: 0, unsorted_payout_cents: 0,
};
const rent = { category_id: "rent", name: "Rent (Upa)", icon: "RE", category_group: "occupancy", system_key: "rent", cents: 500_000, stock_purchase_cents: 0, expenses: 1 };

function ready(
  overrides: Partial<typeof summary> = {},
  extra: { everRecorded?: boolean | null; periods?: ProfitPeriodFigures[] | null } = {},
): ProfitScreenData {
  return composeProfit(resolveProfitWindow({ preset: "this_month" }, Date.now()), {
    summary: { ok: true, data: toProfitFigures([{ ...summary, ...overrides }]) },
    categories: { ok: true, data: toExpenseCategoryTotals([rent]) },
    previousCategories: null,
    periods: extra.periods ? { ok: true, data: extra.periods } : null,
    everRecorded: extra.everRecorded ?? null,
  });
}

const refetch = jest.fn(async () => {});

function answer(data: ProfitScreenData | undefined, extra: { isLoading?: boolean; error?: string | null } = {}) {
  jest.mocked(useProfit).mockReturnValue({
    data,
    isLoading: extra.isLoading ?? data === undefined,
    error: extra.error ?? null,
    refetch,
    isRefetching: false,
    dataUpdatedAt: 1,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useProfitBills).mockReturnValue(NO_BILLS);
  mockSession.isOwner = true;
  mockSession.permissions = null;
  mockSession.orderBackend = "platform";
});

describe("who sees profit", () => {
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
});

describe("the answer", () => {
  it("says a loss in words, with the falling bar and the three guides", () => {
    answer(ready());
    const screen = render(<ProfitScreen />);
    // ₱10,000 − ₱4,000 − ₱8,000 = −₱2,000.
    const month = resolveProfitWindow({ preset: "this_month" }, Date.now()).label;
    expect(screen.getByText(`Lost in ${month} so far`)).toBeTruthy();
    expect(screen.getByText("You spent ₱2,000 more than the ₱10,000 you made in sales.")).toBeTruthy();
    expect(screen.getByLabelText("Lost ₱2,000")).toBeTruthy();
    expect(screen.getByLabelText("Food cost: 40% of sales, On the high side")).toBeTruthy();
    expect(screen.getByLabelText("Staff: 30% of sales, Usual")).toBeTruthy();
    expect(screen.getByLabelText("Rent: 50% of sales, High")).toBeTruthy();
    expect(screen.getByText("Food + staff: 70% of sales")).toBeTruthy();
  });

  it("explains a tile in plain words when tapped", () => {
    answer(ready());
    const screen = render(<ProfitScreen />);
    fireEvent.press(screen.getByLabelText("Rent: 50% of sales, High"));
    expect(screen.getByText(/Rent is what your space costs/)).toBeTruthy();
    expect(screen.getByText(/most restaurants land at 10% or less/)).toBeTruthy();
  });

  it("opens the expense book on the category a bar stands for, for the same days", () => {
    answer(ready());
    const screen = render(<ProfitScreen />);
    fireEvent.press(screen.getByLabelText(/^Rent, ₱5,000/));
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/\(main\)\/expenses\?category=rent&from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/));
  });

  it("opens every expense for the same days", () => {
    answer(ready());
    const screen = render(<ProfitScreen />);
    fireEvent.press(screen.getByLabelText("All expenses: Where the money went"));
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/\(main\)\/expenses\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/));
  });

  it("greets a store that never recorded an expense, with ONE way to add the first", () => {
    answer(ready({ expense_count: 0 }, { everRecorded: false }));
    const screen = render(<ProfitScreen />);
    expect(screen.getByText("Profit is sales, minus ingredients, minus expenses")).toBeTruthy();
    expect(screen.queryByText(/^No expenses recorded this month/)).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Add expense" });
    expect(buttons.length).toBe(1);
    fireEvent.press(buttons[0]);
    expect(router.push).toHaveBeenCalledWith("/(main)/expenses?add=1");
  });

  it("offers monthly bills as the second way to start", () => {
    answer(ready({ expense_count: 0 }, { everRecorded: false }));
    const screen = render(<ProfitScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Set up monthly bills" }));
    expect(router.push).toHaveBeenCalledWith("/(main)/expense-bills?new=1");
  });

  it("never greets an established store as new when the period is merely empty", () => {
    answer(ready({ expense_count: 0 }, { everRecorded: true }));
    const screen = render(<ProfitScreen />);
    expect(screen.queryByText("Profit is sales, minus ingredients, minus expenses")).toBeNull();
    expect(screen.getByText(/^No expenses recorded this month/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add expense" }).length).toBe(1);
  });

  it("draws the last three months, the running one striped", () => {
    const month = (bucket: string, sales: number) => ({
      bucket, orders: 1, netSalesCents: sales, collectedCents: sales, saleMovements: 0, ledgerCogsCents: 0, fallbackCogsCents: 0,
      wasteCents: 0, countVarianceCents: 0, ingredientDirectCents: 0, ingredientStockCents: 0, expensesCents: 0, cashOutCents: 0,
    });
    answer(ready({}, { periods: [month("2026-08-01", 500_000), month("2026-09-01", 600_000)] }));
    const screen = render(<ProfitScreen />);
    expect(screen.getByText("Last 3 months")).toBeTruthy();
    expect(screen.getByText(/The striped bar is still running/)).toBeTruthy();
  });
});

describe("bills to pay", () => {
  it("says what is left once this month's bills are paid, under the answer", () => {
    jest.mocked(useProfitBills).mockReturnValue({ findings: null, still: { cents: 1_000_000, count: 2, hasEstimate: true } });
    answer(ready({ occupancy_cents: 0, staff_cents: 0 }));
    const screen = render(<ProfitScreen />);
    // ₱10,000 − ₱4,000 = ₱6,000 kept; minus ₱10,000 still to pay.
    expect(screen.getByTestId("profit-hero-forecast").props.children).toBe("If you pay the 2 bills left: about ₱4,000 lost");
  });

  it("says nothing about bills when none are left to pay", () => {
    jest.mocked(useProfitBills).mockReturnValue({ findings: null, still: { cents: 0, count: 0, hasEstimate: false } });
    answer(ready());
    expect(render(<ProfitScreen />).queryByTestId("profit-hero-forecast")).toBeNull();
  });

  it("an unpaid bill replaces the category guess and opens that bill", () => {
    jest.mocked(useProfitBills).mockReturnValue({
      still: null,
      findings: {
        hasBills: true,
        cards: [
          {
            key: "bill:bill-rent",
            tone: "warning",
            icon: "calendar",
            title: "Rent is due on the 5th and not marked paid",
            detail: "₱15,000. Until it’s in, profit looks higher than it is.",
            action: { kind: "bill", label: "Pay", billId: "bill-rent" },
          },
        ],
      },
    });
    answer(ready());
    const screen = render(<ProfitScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Pay" }));
    expect(router.push).toHaveBeenCalledWith("/(main)/expense-bills?bill=bill-rent");
  });
});

describe("the period", () => {
  it("re-reads the chosen period", () => {
    answer(ready());
    const screen = render(<ProfitScreen />);
    fireEvent.press(screen.getByLabelText("Period This week"));
    const calls = jest.mocked(useProfit).mock.calls;
    expect(calls[calls.length - 1][0].preset).toBe("this_week");
  });
});

describe("states", () => {
  it("keeps the header and the period control while the first read runs", () => {
    answer(undefined);
    const screen = render(<ProfitScreen />);
    expect(screen.getByRole("header", { name: "Profit" })).toBeTruthy();
    expect(screen.getByLabelText("Period This month")).toBeTruthy();
    expect(screen.getByLabelText("Loading profit")).toBeTruthy();
  });

  it("says plainly when profit could not load, with a retry", () => {
    answer(undefined, { isLoading: false, error: "Profit couldn’t load. Pull down to try again." });
    const screen = render(<ProfitScreen />);
    expect(screen.getByText("Profit couldn’t load")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("keeps the figures and says so quietly when only a refresh failed", () => {
    answer(ready(), { error: "offline" });
    const screen = render(<ProfitScreen />);
    expect(screen.getByText(/Couldn’t refresh/)).toBeTruthy();
    expect(screen.getByLabelText("Lost ₱2,000")).toBeTruthy();
  });

  it("switches to cash flow", () => {
    answer(ready({ capex_cents: 2_500_000 }));
    const screen = render(<ProfitScreen />);
    fireEvent.press(screen.getByLabelText("Show Cash flow"));
    expect(screen.getByText("Collected from sales")).toBeTruthy();
    expect(screen.getByText("Big purchases (equipment)")).toBeTruthy();
  });
});
