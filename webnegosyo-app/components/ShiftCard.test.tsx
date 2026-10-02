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
});
afterEach(() => jest.restoreAllMocks());

async function countAndConfirm(screen: ReturnType<typeof render>, text: string) {
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), text);
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
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
  await countAndConfirm(screen, "125");
  expect(closeShift).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Confirm end of shift").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
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

it("lets the cashier back out of counting the drawer", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.press(screen.getByLabelText("Cancel"));
  expect(screen.queryByLabelText("Counted cash in pesos")).toBeNull();
});

it("closes once when Confirm is tapped twice before the first tap lands", async () => {
  let finish: () => void = () => {};
  jest.mocked(closeShift).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await countAndConfirm(screen, "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
  finish();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Shift ended", expect.any(String)));
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
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Shift ended", expect.any(String)));
  expect(screen.getByText("Start your shift")).toBeTruthy();
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

  it("lets the owner count and close a cashier's drawer on their behalf", async () => {
    mockSession.isOwner = true;
    const screen = render(<ShiftCard orders={[anaSale]} pageLimit={200} />);
    await waitFor(() => expect(screen.getByText("All drawers")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Count and close Ana's drawer"));
    fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "2500");
    fireEvent.press(screen.getByLabelText("Confirm end of shift"));
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
