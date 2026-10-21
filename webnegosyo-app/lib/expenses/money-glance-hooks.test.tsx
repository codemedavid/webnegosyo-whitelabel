import { renderHook } from "@testing-library/react-native";

import type { BranchScope } from "../branch-scope";
import { listCashMoves } from "../cash-drawer-service";
import { readHistoryPayouts, useMonthSpent, useSpentToday } from "./money-glance-hooks";
import type { Expense, ExpenseCategory } from "./types";

let mockScope: BranchScope = { kind: "all" };
let mockCategories: ExpenseCategory[] | undefined;
let mockRecent: Expense[] | undefined;
let mockMonth: Expense[] | undefined;

jest.mock("expo-router", () => ({ useFocusEffect: jest.fn() }));
jest.mock("../../stores/auth-store", () => ({ useAuthStore: (select: (s: object) => unknown) => select({ userId: "u", outletName: null }) }));
jest.mock("../../stores/branch-context-store", () => ({
  useBranchContextStore: (select: (s: object) => unknown) => select({ selectedOutletId: null }),
}));
jest.mock("../use-branch-scope", () => ({ useBranchScope: () => mockScope, useAccountBranchScope: () => ({ kind: "all" }) }));
jest.mock("../use-outlets", () => ({ useOutlets: () => ({ outlets: [] }) }));
jest.mock("../profit/use-profit", () => ({ useProfit: () => ({ data: undefined }) }));
jest.mock("../query/use-resource", () => ({ useResource: () => ({ data: undefined }) }));
jest.mock("../shift-service", () => ({ loadOpenShift: jest.fn() }));
jest.mock("../cash-drawer-service", () => ({ listCashMoves: jest.fn(async () => []) }));
jest.mock("./expense-client", () => ({ liveExpenseDb: {} }));
jest.mock("./expense-service", () => ({ listMovementLinks: jest.fn(async () => new Map()) }));
jest.mock("./use-drawer-expenses", () => ({ SHIFT_LINKS_RESOURCE: "expense-shift-links" }));
jest.mock("./expense-format", () => ({
  ...jest.requireActual("./expense-format"),
  manilaToday: () => "2026-10-22",
}));
jest.mock("./use-expenses", () => ({
  useExpenseTenant: () => "t1",
  useExpenseCategories: () => ({ data: mockCategories, categories: mockCategories ?? [] }),
  useRecentExpenses: () => ({ data: mockRecent, expenses: mockRecent ?? [] }),
  useExpenseMonth: () => ({ data: mockMonth ? { expenses: mockMonth } : undefined }),
}));

const ownerTookCash: ExpenseCategory = {
  id: "owner", tenantId: "t1", systemKey: "owner", name: "Owner took cash", icon: null, group: "not_expense", needsNote: false, sortOrder: 0, archivedAt: null,
};

function expense(id: string, overrides: Partial<Expense>): Expense {
  return {
    id, tenantId: "t1", outletId: null, categoryId: "lpg", supplierId: null, paidToName: null, staffUserId: null, note: null,
    amountCents: 100_00, spentOn: "2026-10-22", paidFrom: "cash", shiftCashMovementId: null, isStockPurchase: false,
    status: "recorded", voidReason: null, voidedBy: null, voidedAt: null, replacesExpenseId: null, clientRequestId: null,
    createdBy: null, createdByName: "Owner", createdAt: "2026-10-22T02:00:00Z", receiptCount: 0, docType: null,
    invoiceNo: null, supplierTin: null, vatCents: null, ewtCents: null, ewtRate: null, form2307Given: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockScope = { kind: "all" };
  mockCategories = [ownerTookCash];
  mockRecent = [expense("a", { amountCents: 300_00 }), expense("b", { categoryId: "owner", amountCents: 2_000_00 })];
  mockMonth = mockRecent;
  jest.mocked(listCashMoves).mockClear();
});

describe("useSpentToday", () => {
  it("shows nothing while the categories are loading, so cash merely moved never reads as spending", () => {
    mockCategories = undefined;

    const { result } = renderHook(() => useSpentToday(true));

    expect(result.current).toBeNull();
  });

  it("leaves out cash merely moved once the categories are in", () => {
    const { result } = renderHook(() => useSpentToday(true));

    expect(result.current).toEqual({ cents: 300_00, count: 1, drawerCount: 0 });
  });

  it("counts only the branch being viewed", () => {
    mockScope = { kind: "branch", outletId: "makati" };
    mockRecent = [expense("a", { outletId: "makati", amountCents: 400_00 }), expense("b", { outletId: "bgc", amountCents: 250_00 })];

    const { result } = renderHook(() => useSpentToday(true));

    expect(result.current).toEqual({ cents: 400_00, count: 1, drawerCount: 0 });
  });
});

describe("useMonthSpent", () => {
  it("shows nothing while the categories are loading", () => {
    mockCategories = undefined;

    const { result } = renderHook(() => useMonthSpent());

    expect(result.current).toBeNull();
  });

  it("adds up the month once the categories are in, without cash merely moved", () => {
    const { result } = renderHook(() => useMonthSpent());

    expect(result.current?.cents).toBe(300_00);
  });
});

describe("readHistoryPayouts", () => {
  it("reads past shifts' cash moves at most 20 shifts per request, so one read stays under the row cap", async () => {
    const ids = Array.from({ length: 45 }, (_, index) => `s${index}`);

    await readHistoryPayouts("t1", ids);

    const sizes = jest.mocked(listCashMoves).mock.calls.map(([, shiftIds]) => shiftIds.length);
    expect(sizes).toEqual([20, 20, 5]);
  });
});
