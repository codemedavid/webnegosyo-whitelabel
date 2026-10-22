import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ShiftCard } from "./ShiftCard";
import { closeShift, isShiftStillOpen, listOpenShifts, loadOpenShift, openShift, type ShiftRecord } from "../lib/shift-service";
import { listCashMoves, listDrawers, recordCashMove } from "../lib/cash-drawer-service";

const mockSession = { tenantId: "tenant", userId: "cashier", isDemo: false, isOwner: false, permissions: ["pos"] as string[] | null, role: "admin" };
let mockLedgerError: string | null = null;
const mockPayments = [{ orderId: "order", kind: "charge", amount: 25, paymentMethodName: "Cash", recordedBy: "cashier", _creationTime: Date.parse("2026-01-01T10:00:00Z") }];
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: React.EffectCallback) => { const { useEffect } = jest.requireActual<typeof React>("react"); useEffect(effect, [effect]); },
}));
jest.mock("../stores/auth-store", () => ({ useAuthStore: Object.assign((select: (state: typeof mockSession) => unknown) => select(mockSession), { getState: () => mockSession }) }));
jest.mock("../stores/branch-context-store", () => {
  const state = { selectedOutletId: null, selectedOutletName: null, knownOutletIds: null };
  return { useBranchContextStore: Object.assign((select: (s: typeof state) => unknown) => select(state), { getState: () => state }) };
});
jest.mock("../lib/register-outlet", () => ({ resolveRegisterOutlet: () => null }));
jest.mock("../lib/hooks", () => ({ useSafeQuery: () => ({ data: mockLedgerError ? undefined : mockPayments, error: mockLedgerError, isMissingFunction: false }), useRefRoute: () => "platform" }));
jest.mock("../lib/supabase", () => ({ supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { user: { email: "cashier@store.ph", user_metadata: {} } } } })) } } }));
jest.mock("../lib/shift-service", () => ({
  loadOpenShift: jest.fn(), closeShift: jest.fn(), openShift: jest.fn(), listOpenShifts: jest.fn(), isShiftStillOpen: jest.fn(),
}));
jest.mock("../lib/cash-drawer-service", () => ({ listDrawers: jest.fn(), listCashMoves: jest.fn(), recordCashMove: jest.fn() }));
jest.mock("../lib/staff-activity/activity-service", () => ({ listOrderActivity: jest.fn(async () => []) }));
// Expenses: off by default (a store whose database predates them), so the
// free-text pay out is still offered; the expense tests switch it on.
const mockDrawerExpenses = {
  isReady: false,
  pendingFor: jest.fn(() => ({ cents: 0, count: 0, waiting: 0 })),
  refusedFor: jest.fn((): { id: string; categoryName: string; cents: number; reason: string }[] => []),
  retryRefused: jest.fn<Promise<void>, [string]>(async () => {}),
  removeRefused: jest.fn<Promise<void>, [string]>(async () => {}),
  payouts: null as unknown,
  reloadPayouts: jest.fn(async () => {}),
  settleBeforeClose: jest.fn<Promise<{ waiting: number; refused: number }>, [string]>(async () => ({ waiting: 0, refused: 0 })),
};
jest.mock("../lib/expenses/use-drawer-expenses", () => ({ useDrawerExpenses: () => mockDrawerExpenses }));
// The close sheet reads which pay-outs were expenses; the floor reads them for every drawer.
let mockLinks = new Map<string, unknown>();
let mockFloorLinks: Map<string, unknown> | null = null;
let mockCanManageExpenses = false;
let mockCategoriesRead: { data: unknown[] | undefined; error: string | null } = { data: [], error: null };
jest.mock("../lib/expenses/expense-client", () => ({ liveExpenseDb: {} }));
jest.mock("../lib/expenses/expense-service", () => ({ listMovementLinks: jest.fn(async () => mockLinks) }));
jest.mock("../lib/expenses/money-glance-hooks", () => ({ usePayoutLinks: () => mockFloorLinks }));
jest.mock("../lib/expenses/use-expenses", () => ({
  useExpenseCategories: () => ({ ...mockCategoriesRead, categories: mockCategoriesRead.data ?? [] }),
  useCategoryIndex: () => new Map(),
  useCanManageExpenses: () => mockCanManageExpenses,
}));
const mockExpenseSheet = jest.fn();
jest.mock("./expenses/AddExpenseSheet", () => ({
  AddExpenseSheet: (props: Record<string, unknown>) => {
    mockExpenseSheet(props);
    return null;
  },
}));

const myShift: ShiftRecord = {
  id: "shift", outletId: null, staffUserId: "cashier", staffName: "Cashier", status: "open", openingFloat: 100,
  openedAt: "2026-01-01T09:00:00Z", closedAt: null, closingCount: null, expectedCash: null, note: null,
  drawerId: null, drawerName: null, isZeroBalance: false, closedByName: null,
};
const orders = [{ _id: "order", _creationTime: Date.parse("2026-01-01T10:00:00Z"), source: "pos", total: 100, paymentMethod: "GCash", customerData: { pos: { cashierId: "cashier" } } }];
const drawer = (id: string, name: string, over = {}) => ({ id, outletId: null, name, startingCash: 2000, isZeroBalance: false, sortOrder: 0, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockLedgerError = null;
  mockSession.isOwner = false;
  mockSession.permissions = ["pos"];
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.mocked(loadOpenShift).mockResolvedValue(myShift);
  jest.mocked(listOpenShifts).mockResolvedValue([myShift]);
  jest.mocked(listDrawers).mockResolvedValue([]);
  jest.mocked(listCashMoves).mockResolvedValue([]);
  jest.mocked(closeShift).mockResolvedValue(undefined);
  mockDrawerExpenses.isReady = false;
  mockDrawerExpenses.payouts = null;
  mockDrawerExpenses.pendingFor.mockReturnValue({ cents: 0, count: 0, waiting: 0 });
  mockDrawerExpenses.settleBeforeClose.mockResolvedValue({ waiting: 0, refused: 0 });
  mockDrawerExpenses.refusedFor.mockReturnValue([]);
  mockLinks = new Map();
  mockFloorLinks = null;
  mockCanManageExpenses = false;
  mockCategoriesRead = { data: [], error: null };
});
afterEach(() => jest.restoreAllMocks());

/** Opens End shift, types the count and taps Continue — the close sheet is next. */
async function countOnly(screen: ReturnType<typeof render>, text: string) {
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), text);
  fireEvent.press(screen.getByLabelText("Confirm the count"));
}

/** Counts, then ends the shift on the close sheet. */
async function countAndConfirm(screen: ReturnType<typeof render>, text: string) {
  await countOnly(screen, text);
  await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift and save the count"));
}

it("freezes the actual cash ledger plus opening float when the cashier closes", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByText("My cash sales")).toBeTruthy());
  await countAndConfirm(screen, "125");
  await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ expectedCash: 125, closingCount: 125 })));
});

it("shows the verdict live while the cashier types the count", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "105");
  expect(screen.getByText(/Short ₱20/)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  expect(screen.getByText("Balanced")).toBeTruthy();
});

it("nets a pickup recorded on another tablet before freezing the expectation", async () => {
  jest.mocked(listCashMoves).mockResolvedValue([
    { id: "m", shiftId: "shift", kind: "collect", amount: 25, reason: null, recordedByName: "Owner", createdAt: "2026-01-01T11:00:00Z" },
  ]);
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await countAndConfirm(screen, "100");
  await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ expectedCash: 100 })));
});

it.each(["unavailable", "truncated"])("does not close a shift with %s settlement history", async (mode) => {
  if (mode === "unavailable") mockLedgerError = "Connection lost";
  const screen = render(<ShiftCard orders={orders} pageLimit={mode === "truncated" ? 1 : 200} />);
  await countOnly(screen, "125");
  expect(closeShift).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("End shift and save the count")).toBeNull();
  expect(screen.getByLabelText("Confirm the count").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
});

// A store with years of history always fills the 200-order page. That alone
// used to mark the history "incomplete", so Confirm was dead on every busy
// register — the tablet at the counter — while still looking tappable.
it("closes a shift on a store whose order page is full but reaches back past the clock-in", async () => {
  const history = [...orders, { ...orders[0], _id: "old", _creationTime: Date.parse("2025-12-01T10:00:00Z") }];
  const screen = render(<ShiftCard orders={history} pageLimit={2} />);
  await countAndConfirm(screen, "125");
  await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
});

describe("the drawer changing between the count and End shift", () => {
  const changedNotice = "The drawer changed while you were counting. Check the new total.";

  it("shows the new total and does not close on that tap when a pay-in landed meanwhile", async () => {
    // Arrange: ₱100 float + ₱25 cash sale = ₱125 at the count.
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await countOnly(screen, "125");
    await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
    // Both the total and the count read ₱125.
    expect(screen.getAllByText("₱125")).toHaveLength(2);
    // Another tablet puts ₱50 in before End shift.
    jest.mocked(listCashMoves).mockResolvedValue([
      { id: "in", shiftId: "shift", kind: "pay_in", amount: 50, reason: "Change", recordedByName: "Owner", createdAt: "2026-01-01T11:00:00Z" },
    ]);

    // Act
    fireEvent.press(screen.getByLabelText("End shift and save the count"));

    // Assert: the sheet stays, says why, and shows the new figure and difference.
    await waitFor(() => expect(screen.getByText(changedNotice)).toBeTruthy());
    expect(closeShift).not.toHaveBeenCalled();
    expect(screen.getByText("Should be in the drawer")).toBeTruthy();
    expect(screen.getByText("₱175")).toBeTruthy();
    expect(screen.getByText("₱50 short")).toBeTruthy();

    // A second tap closes against the new figure, with the same count.
    fireEvent.press(screen.getByLabelText("End shift and save the count"));
    await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
    expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ expectedCash: 175, closingCount: 125 }));
  });

  it("closes once with the freshly read figure when nothing changed", async () => {
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await countOnly(screen, "125");
    await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
    const readsBeforeEnd = jest.mocked(listCashMoves).mock.calls.length;

    fireEvent.press(screen.getByLabelText("End shift and save the count"));

    await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
    expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ expectedCash: 125, closingCount: 125 }));
    expect(jest.mocked(listCashMoves).mock.calls.length).toBeGreaterThan(readsBeforeEnd);
    expect(screen.queryByText(changedNotice)).toBeNull();
  });

  it("keeps the sheet open when an expense is still waiting to sync at End shift", async () => {
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await countOnly(screen, "125");
    await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
    mockDrawerExpenses.settleBeforeClose.mockResolvedValue({ waiting: 1, refused: 0 });

    fireEvent.press(screen.getByLabelText("End shift and save the count"));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Not ready to close", expect.stringMatching(/1 drawer expense is still waiting/), expect.anything()),
    );
    expect(closeShift).not.toHaveBeenCalled();
    expect(screen.getByLabelText("End shift and save the count")).toBeTruthy();
  });
});

it("confirms the close with what was counted and the difference", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await countAndConfirm(screen, "105");
  // The pop-up follows the post-close reload (see the double-tap test on timing).
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Shift ended", "Counted ₱105 · ₱20 short"), { timeout: 5_000 });
});

it("lets the cashier back out of counting the drawer", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.press(screen.getByLabelText("Cancel"));
  expect(screen.queryByLabelText("Counted cash in pesos")).toBeNull();
});

it("closes once when End shift is tapped twice before the first tap lands", async () => {
  let finish: () => void = () => {};
  jest.mocked(closeShift).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await countAndConfirm(screen, "125");
  fireEvent.press(screen.getByLabelText("End shift and save the count"));
  await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
  finish();
  // Re-rendering the card after a close takes ~0.8s on this renderer; under
  // the parallel run that overshoots waitFor's 1s default.
  await waitFor(() => expect(screen.queryByLabelText("End shift and save the count")).toBeNull(), { timeout: 5_000 });
  expect(closeShift).toHaveBeenCalledTimes(1);
});

it("reads a decimal-comma count the way the tablet's keypad typed it", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await countAndConfirm(screen, "125,00");
  await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ closingCount: 125 })));
});

it("treats a close that already landed as ended when the retry finds the shift closed", async () => {
  jest.mocked(closeShift).mockRejectedValue(new Error("The request timed out."));
  jest.mocked(isShiftStillOpen).mockResolvedValue(false);
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  jest.mocked(loadOpenShift).mockResolvedValue(null);
  jest.mocked(listOpenShifts).mockResolvedValue([]);
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm the count"));
  await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift and save the count"));
  await waitFor(() => expect(screen.getByText("Start your shift")).toBeTruthy());
  expect(Alert.alert).not.toHaveBeenCalledWith("Could not end the shift", expect.any(String));
});

it("does not claim a timed-out close landed when the follow-up read also fails", async () => {
  jest.mocked(closeShift).mockRejectedValue(new Error("The request timed out."));
  jest.mocked(isShiftStillOpen).mockRejectedValue(new Error("offline"));
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await countAndConfirm(screen, "125");
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Could not end the shift", "The request timed out."));
  expect(screen.getByText("My cash sales")).toBeTruthy();
});

it("records a pay out from the cashier's own drawer with its reason", async () => {
  jest.mocked(recordCashMove).mockResolvedValue({ id: "m", shiftId: "shift", kind: "pay_out", amount: 20, reason: "Ice", recordedByName: "x", createdAt: "" });
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByText("Cash in / out")).toBeTruthy());
  fireEvent.press(screen.getByText("Cash in / out"));
  fireEvent.changeText(screen.getByLabelText("Pay out amount in pesos"), "20");
  fireEvent.changeText(screen.getByLabelText("Reason"), "Ice");
  fireEvent.press(screen.getByLabelText("Record pay out"));
  await waitFor(() => expect(recordCashMove).toHaveBeenCalledWith("tenant", expect.objectContaining({ shiftId: "shift", kind: "pay_out", amount: 20, reason: "Ice" })));
});

describe("clock in", () => {
  beforeEach(() => {
    jest.mocked(loadOpenShift).mockResolvedValue(null);
    jest.mocked(listOpenShifts).mockResolvedValue([]);
  });

  it("starts one shift when Clock in is tapped twice", async () => {
    let finish: (value: never) => void = () => {};
    jest.mocked(openShift).mockImplementation(() => new Promise((resolve) => { finish = resolve as never; }));
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByLabelText("Start shift")).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText("Opening float in pesos"), "500");
    fireEvent.press(screen.getByLabelText("Start shift"));
    fireEvent.press(screen.getByLabelText("Start shift"));
    await waitFor(() => expect(openShift).toHaveBeenCalledTimes(1));
    finish(myShift as never);
    await waitFor(() => expect(listOpenShifts).toHaveBeenCalledTimes(2));
    expect(openShift).toHaveBeenCalledTimes(1);
  });

  it("opens with the float written as the cashier typed it", async () => {
    jest.mocked(openShift).mockResolvedValue(myShift);
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByLabelText("Start shift")).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText("Opening float in pesos"), "₱1,500");
    fireEvent.press(screen.getByLabelText("Start shift"));
    await waitFor(() => expect(openShift).toHaveBeenCalledWith("tenant", expect.objectContaining({ openingFloat: 1500, staffName: "cashier@store.ph", drawerId: null })));
  });

  it("lands on the first free drawer with its standard float pre-filled", async () => {
    jest.mocked(listDrawers).mockResolvedValue([drawer("d1", "Cashier 1"), drawer("d2", "Cashier 2", { sortOrder: 1, startingCash: 1000 })]);
    jest.mocked(listOpenShifts).mockResolvedValue([{ ...myShift, id: "ana", staffUserId: "ana", staffName: "Ana", drawerId: "d1" }]);
    jest.mocked(openShift).mockResolvedValue(myShift);
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("In use · Ana")).toBeTruthy());
    expect(screen.getByLabelText("Opening float in pesos").props.value).toBe("1000");
    fireEvent.press(screen.getByLabelText("Start shift"));
    await waitFor(() => expect(openShift).toHaveBeenCalledWith("tenant", expect.objectContaining({ drawerId: "d2", openingFloat: 1000 })));
  });

  it("locks a zero-balance drawer's starting cash at ₱0", async () => {
    jest.mocked(listDrawers).mockResolvedValue([drawer("z", "Owner drawer", { isZeroBalance: true, startingCash: 0 })]);
    jest.mocked(openShift).mockResolvedValue(myShift);
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText(/Zero-balance drawer — it starts empty/)).toBeTruthy());
    expect(screen.queryByLabelText("Opening float in pesos")).toBeNull();
    fireEvent.press(screen.getByLabelText("Start shift"));
    await waitFor(() => expect(openShift).toHaveBeenCalledWith("tenant", expect.objectContaining({ drawerId: "z", openingFloat: 0 })));
  });

  it("refuses to clock in when every drawer is held", async () => {
    jest.mocked(listDrawers).mockResolvedValue([drawer("d1", "Cashier 1")]);
    jest.mocked(listOpenShifts).mockResolvedValue([{ ...myShift, id: "ana", staffUserId: "ana", staffName: "Ana", drawerId: "d1" }]);
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText(/Every drawer is in use/)).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Start shift"));
    expect(openShift).not.toHaveBeenCalled();
  });
});

describe("owner floor", () => {
  const ana: ShiftRecord = { ...myShift, id: "ana-shift", staffUserId: "ana", staffName: "Ana", drawerId: "d1", drawerName: "Cashier 1", openingFloat: 2000 };
  const anaSale = { ...orders[0], _id: "ana-order", customerData: { pos: { cashierId: "ana" } }, paymentMethod: "Cash", total: 500 };

  beforeEach(() => {
    jest.mocked(loadOpenShift).mockResolvedValue(null);
    jest.mocked(listDrawers).mockResolvedValue([drawer("d1", "Cashier 1"), drawer("d2", "Cashier 2", { sortOrder: 1 })]);
    jest.mocked(listOpenShifts).mockResolvedValue([ana]);
  });

  it("is hidden from a cashier without the store_setup grant", async () => {
    const screen = render(<ShiftCard orders={[anaSale]} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("Start your shift")).toBeTruthy());
    expect(screen.queryByText("All drawers")).toBeNull();
  });

  it("shows each cashier's drawer with its live cash, and collects from it", async () => {
    mockSession.isOwner = true;
    mockSession.permissions = null;
    jest.mocked(recordCashMove).mockResolvedValue({ id: "m", shiftId: "ana-shift", kind: "collect", amount: 2000, reason: null, recordedByName: "x", createdAt: "" });
    const screen = render(<ShiftCard orders={[anaSale]} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("All drawers")).toBeTruthy());
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("₱2,500.00")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Collect cash from Ana"));
    fireEvent.press(screen.getByLabelText("All ₱2,500.00"));
    fireEvent.press(screen.getByLabelText("Record cash pickup"));
    await waitFor(() => expect(recordCashMove).toHaveBeenCalledWith("tenant", expect.objectContaining({ shiftId: "ana-shift", kind: "collect", amount: 2500 })));
  });

  it("shows each open drawer's expenses and cash taken out", async () => {
    mockSession.isOwner = true;
    jest.mocked(listCashMoves).mockResolvedValue([
      { id: "lpg", shiftId: "ana-shift", kind: "pay_out", amount: 1180, reason: "LPG", recordedByName: "Ana", createdAt: "" },
      { id: "pick", shiftId: "ana-shift", kind: "collect", amount: 500, reason: null, recordedByName: "Owner", createdAt: "" },
    ]);
    mockFloorLinks = new Map([["lpg", { expenseId: "e", categoryId: "lpg", categoryName: "Gas / LPG", group: "utilities", status: "recorded" }]]);
    const screen = render(<ShiftCard orders={[anaSale]} pageLimit={200} />);

    await waitFor(() => expect(screen.getByText("Expenses ₱1,180 · Taken out ₱500")).toBeTruthy());
  });

  it("lets the owner count and close a cashier's drawer on their behalf", async () => {
    mockSession.isOwner = true;
    const screen = render(<ShiftCard orders={[anaSale]} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("All drawers")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Count and close Ana's drawer"));
    fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "2500");
    fireEvent.press(screen.getByLabelText("Confirm the count"));
    await waitFor(() => expect(screen.getByText("End Ana's shift")).toBeTruthy());
    expect(screen.getByText("Saved on Ana's shift.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("End shift and save the count"));
    await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "ana-shift", expect.objectContaining({ expectedCash: 2500, closingCount: 2500 })));
  });
});

it("refuses a pickup that another tablet already collected while the sheet was open", async () => {
  mockSession.isOwner = true;
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByText("Cash in / out")).toBeTruthy());
  fireEvent.press(screen.getByText("Cash in / out"));
  fireEvent.press(screen.getByLabelText("Cash move Cash pickup"));
  fireEvent.changeText(screen.getByLabelText("Cash pickup amount in pesos"), "125");
  // Meanwhile the whole drawer was collected elsewhere.
  jest.mocked(listCashMoves).mockResolvedValue([
    { id: "m", shiftId: "shift", kind: "collect", amount: 125, reason: null, recordedByName: "Owner", createdAt: "" },
  ]);
  jest.mocked(recordCashMove).mockImplementation(async (_t, input) => {
    const { validateCashMove } = jest.requireActual<typeof import("../lib/cash-drawers")>("../lib/cash-drawers");
    const verdict = validateCashMove(input, input.expectedInDrawer);
    if (!verdict.ok) throw new Error(verdict.reason);
    return { id: "x", shiftId: "shift", kind: "collect", amount: 125, reason: null, recordedByName: "", createdAt: "" };
  });
  fireEvent.press(screen.getByLabelText("Record cash pickup"));
  await waitFor(() => expect(recordCashMove).toHaveBeenCalledWith("tenant", expect.objectContaining({ expectedInDrawer: 0 })));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Could not record it", expect.stringMatching(/more than this drawer/)));
});

describe("expenses from the drawer", () => {
  beforeEach(() => {
    mockDrawerExpenses.isReady = true;
  });

  it("opens the expense sheet locked to my drawer, with what it should hold less what is still syncing", async () => {
    // ₱100 float + ₱25 cash taken; ₱20 paid out on this phone, not synced yet.
    mockDrawerExpenses.pendingFor.mockReturnValue({ cents: 2_000, count: 1, waiting: 1 });
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("Pay an expense")).toBeTruthy());
    expect(screen.getByText(/1 expense waiting to sync/)).toBeTruthy();

    fireEvent.press(screen.getByText("Pay an expense"));

    await waitFor(() => expect(mockExpenseSheet).toHaveBeenCalled());
    expect(mockExpenseSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: "spend",
        mode: { kind: "drawer", shiftId: "shift", drawerName: "My", availableCents: 10_500 },
      }),
    );
  });

  it("swaps the free-text pay out for 'Pay an expense' and 'Take out cash' in Cash in / out", async () => {
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("Cash in / out")).toBeTruthy());
    fireEvent.press(screen.getByText("Cash in / out"));

    expect(screen.queryByLabelText("Pay out amount in pesos")).toBeNull();
    fireEvent.press(screen.getByLabelText("Take out cash"));

    await waitFor(() => expect(mockExpenseSheet).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "take_out" })));
  });

  it("will not count the drawer while an expense paid from it is still waiting to sync", async () => {
    mockDrawerExpenses.settleBeforeClose.mockResolvedValue({ waiting: 2, refused: 0 });
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);

    await countOnly(screen, "100");

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Not ready to close", expect.stringMatching(/2 drawer expenses are still waiting/), expect.anything()),
    );
    expect(closeShift).not.toHaveBeenCalled();
  });

  it("builds the close sheet line by line, lists what the drawer paid for, and says the drawer is short", async () => {
    // ₱100 float + ₱25 cash sale − ₱20 ice paid from the drawer = ₱105.
    jest.mocked(listCashMoves).mockResolvedValue([
      { id: "ice", shiftId: "shift", kind: "pay_out", amount: 20, reason: "Ice (Yelo)", recordedByName: "Cashier", createdAt: "2026-01-01T03:30:00Z" },
    ]);
    mockLinks = new Map([["ice", { expenseId: "e1", categoryId: "ice", categoryName: "Ice (Yelo)", group: "ingredients", status: "recorded" }]]);
    mockCanManageExpenses = true;
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);

    await countOnly(screen, "100");

    await waitFor(() => expect(screen.getByText("What the drawer should hold")).toBeTruthy());
    expect(screen.getByText("Paid for expenses · 1")).toBeTruthy();
    expect(screen.getByText("Should be in the drawer")).toBeTruthy();
    expect(screen.getByText("Yelo")).toBeTruthy();
    expect(screen.getByText("₱5 short")).toBeTruthy();
    expect(screen.getByText("The owner will see this on the shift.")).toBeTruthy();
    expect(closeShift).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("End shift and save the count"));
    await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ expectedCash: 105, closingCount: 100 })));
  });

  it("keeps one way to pay an expense: the shift card, not Cash in / out", async () => {
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("Cash in / out")).toBeTruthy());
    fireEvent.press(screen.getByText("Cash in / out"));

    expect(screen.getAllByText("Pay an expense")).toHaveLength(1);
    expect(screen.getByText("Take out cash")).toBeTruthy();
  });

  it("opens Pay from the drawer when the register's Pay out asks for it, then clears the request", async () => {
    const handled = jest.fn();
    render(<ShiftCard orders={orders} pageLimit={200} isPayOutRequested onPayOutHandled={handled} />);

    await waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
    expect(mockExpenseSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: "spend", mode: expect.objectContaining({ kind: "drawer", shiftId: "shift" }) }),
    );
  });

  it("drops a Pay out request when the categories could not be read, instead of popping the sheet later", async () => {
    mockDrawerExpenses.isReady = false;
    mockCategoriesRead = { data: undefined, error: "offline" };
    const handled = jest.fn();
    render(<ShiftCard orders={orders} pageLimit={200} isPayOutRequested onPayOutHandled={handled} />);

    await waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
    expect(mockExpenseSheet).not.toHaveBeenCalled();
  });

  it("waits on a Pay out request while the categories are still loading", async () => {
    mockDrawerExpenses.isReady = false;
    mockCategoriesRead = { data: undefined, error: null };
    const handled = jest.fn();
    const screen = render(<ShiftCard orders={orders} pageLimit={200} isPayOutRequested onPayOutHandled={handled} />);

    await waitFor(() => expect(screen.getByText("Cash in / out")).toBeTruthy());
    expect(handled).not.toHaveBeenCalled();
  });

  it("says to start a shift when the register's Pay out asks with no open shift", async () => {
    jest.mocked(loadOpenShift).mockResolvedValue(null);
    jest.mocked(listOpenShifts).mockResolvedValue([]);
    const handled = jest.fn();
    const screen = render(<ShiftCard orders={orders} pageLimit={200} isPayOutRequested onPayOutHandled={handled} />);

    await waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
    expect(mockExpenseSheet).not.toHaveBeenCalled();
    expect(screen.getByText("Start a shift to pay from the drawer.")).toBeTruthy();
  });

  it("acts on one Pay out request once, even when the screen hands a new callback every render", async () => {
    // Arrange: the parent passes an inline arrow, so its identity changes on every render.
    const handled = jest.fn();
    const screen = render(<ShiftCard orders={orders} pageLimit={200} isPayOutRequested onPayOutHandled={() => handled()} />);
    await waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
    const opened = mockExpenseSheet.mock.calls.length;

    // Act: the parent re-renders before it clears the param.
    screen.rerender(<ShiftCard orders={orders} pageLimit={200} isPayOutRequested onPayOutHandled={() => handled()} />);
    screen.rerender(<ShiftCard orders={orders} pageLimit={200} isPayOutRequested onPayOutHandled={() => handled()} />);

    // Assert
    expect(handled).toHaveBeenCalledTimes(1);
    expect(mockExpenseSheet.mock.calls.length).toBeGreaterThanOrEqual(opened);
    expect(screen.queryByText("Start a shift to pay from the drawer.")).toBeNull();
  });
});

describe("pay-outs the store did not take", () => {
  const refusedIce = { id: "ice-req", categoryName: "Ice (Yelo)", cents: 12_000, reason: "This category was removed." };

  beforeEach(() => {
    mockDrawerExpenses.isReady = true;
    mockDrawerExpenses.refusedFor.mockReturnValue([refusedIce]);
  });

  it("shows them on the shift card apart from what is waiting, with Try again and Remove right there", async () => {
    // Arrange
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);

    // Assert: told plainly, never as "waiting to sync".
    await waitFor(() => expect(screen.getByText("1 pay-out didn't save · ₱120")).toBeTruthy());
    expect(screen.getByText("This category was removed.")).toBeTruthy();
    expect(screen.queryByText(/waiting to sync/)).toBeNull();

    // Act
    fireEvent.press(screen.getByLabelText("Try again: Ice (Yelo) ₱120"));

    // Assert
    await waitFor(() => expect(mockDrawerExpenses.retryRefused).toHaveBeenCalledWith("ice-req"));
  });

  it("removes one after the cashier confirms", async () => {
    jest.mocked(Alert.alert).mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Remove")?.onPress?.();
    });
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("1 pay-out didn't save · ₱120")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Remove: Ice (Yelo) ₱120"));

    await waitFor(() => expect(mockDrawerExpenses.removeRefused).toHaveBeenCalledWith("ice-req"));
  });

  it("explains them on the close sheet and will not end the shift until each is sent or removed", async () => {
    // Arrange
    mockDrawerExpenses.settleBeforeClose.mockResolvedValue({ waiting: 0, refused: 1 });
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await countOnly(screen, "105");
    await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
    expect(screen.getAllByText("1 pay-out didn't save · ₱120").length).toBeGreaterThan(0);
    expect(screen.getByText(/the drawer reads ₱120 short/)).toBeTruthy();

    // Act
    fireEvent.press(screen.getByLabelText("End shift and save the count"));

    // Assert
    await waitFor(() => expect(screen.getByText(/Try again or remove the pay-out that didn't save/)).toBeTruthy());
    expect(closeShift).not.toHaveBeenCalled();

    // Once it is removed, End shift closes.
    mockDrawerExpenses.settleBeforeClose.mockResolvedValue({ waiting: 0, refused: 0 });
    mockDrawerExpenses.refusedFor.mockReturnValue([]);
    fireEvent.press(screen.getByLabelText("End shift and save the count"));
    await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
  });
});

describe("the close guard fails closed", () => {
  beforeEach(() => {
    // The failure is logged for support; the test only cares what the cashier sees.
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("will not count the drawer when this phone cannot check its pay-outs, and offers Try again", async () => {
    // Arrange
    mockDrawerExpenses.settleBeforeClose.mockRejectedValueOnce(new Error("storage full"));
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);

    // Act
    await countOnly(screen, "125");

    // Assert
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Not ready to close",
        expect.stringMatching(/could not check/i),
        expect.arrayContaining([expect.objectContaining({ text: "Try again" })]),
      ),
    );
    expect(screen.queryByLabelText("End shift and save the count")).toBeNull();

    // Try again (the phone can read now) opens the close sheet.
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    buttons?.find((button) => button.text === "Try again")?.onPress?.();
    await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
  });

  it("does not end the shift when the check fails at End shift", async () => {
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await countOnly(screen, "125");
    await waitFor(() => expect(screen.getByLabelText("End shift and save the count")).toBeTruthy());
    mockDrawerExpenses.settleBeforeClose.mockRejectedValueOnce(new Error("storage full"));

    fireEvent.press(screen.getByLabelText("End shift and save the count"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Not ready to close", expect.stringMatching(/could not check/i), expect.anything()));
    expect(closeShift).not.toHaveBeenCalled();
  });
});
