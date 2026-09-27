import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ShiftCard } from "./ShiftCard";
import { closeShift, fetchOpenShift, loadOpenShift, openShift } from "../lib/shift-service";

const mockSession = { tenantId: "tenant", userId: "cashier", isDemo: false };
let mockLedgerError: string | null = null;
const mockPayments = [{ orderId: "order", kind: "charge", amount: 25, paymentMethodName: "Cash", recordedBy: "cashier", _creationTime: Date.parse("2026-01-01T10:00:00Z") }];
jest.mock("expo-router", () => ({ useFocusEffect: (effect: React.EffectCallback) => { const { useEffect } = jest.requireActual<typeof React>("react"); useEffect(effect, [effect]); } }));
jest.mock("../stores/auth-store", () => ({ useAuthStore: Object.assign((select: (state: typeof mockSession) => unknown) => select(mockSession), { getState: () => mockSession }) }));
jest.mock("../lib/hooks", () => ({ useSafeQuery: () => ({ data: mockLedgerError ? undefined : mockPayments, error: mockLedgerError, isMissingFunction: false }), useRefRoute: () => "platform" }));
jest.mock("../lib/supabase", () => ({ supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { user: { email: "cashier@store.ph", user_metadata: {} } } } })) } } }));
jest.mock("../lib/shift-service", () => ({ loadOpenShift: jest.fn(), fetchOpenShift: jest.fn(), closeShift: jest.fn(), openShift: jest.fn() }));
jest.mock("../lib/staff-activity/activity-service", () => ({ listOrderActivity: jest.fn(async () => []) }));

const orders = [{ _id: "order", _creationTime: Date.parse("2026-01-01T10:00:00Z"), source: "pos", total: 100, paymentMethod: "GCash", customerData: { pos: { cashierId: "cashier" } } }];
beforeEach(() => {
  jest.clearAllMocks();
  mockLedgerError = null;
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.mocked(loadOpenShift).mockResolvedValue({ id: "shift", outletId: null, staffUserId: "cashier", staffName: "Cashier", status: "open", openingFloat: 100, openedAt: "2026-01-01T09:00:00Z", closedAt: null, closingCount: null, expectedCash: null, note: null });
  jest.mocked(closeShift).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

it("freezes the actual cash ledger plus opening float when the cashier closes", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByText(/my cash sales/)).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ expectedCash: 125, closingCount: 125 })));
});

it.each(["unavailable", "truncated"])("does not close a shift with %s settlement history", async mode => {
  if (mode === "unavailable") mockLedgerError = "Connection lost";
  const screen = render(<ShiftCard orders={orders} pageLimit={mode === "truncated" ? 1 : 200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  expect(closeShift).not.toHaveBeenCalled();
});

// A store with years of history always fills the 200-order page. That alone
// used to mark the history "incomplete", so Confirm was dead on every busy
// register — the tablet at the counter — while still looking tappable.
it("closes a shift on a store whose order page is full but reaches back past the clock-in", async () => {
  const history = [...orders, { ...orders[0], _id: "old", _creationTime: Date.parse("2025-12-01T10:00:00Z") }];
  const screen = render(<ShiftCard orders={history} pageLimit={2} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
});

it("shows a refused Confirm as disabled and says why, instead of a button that silently does nothing", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={1} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  const confirm = screen.getByLabelText("Confirm end of shift");
  expect(confirm.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  expect(screen.getByText(/More orders than this screen reads/)).toBeTruthy();
});

it("lets the cashier back out of counting the drawer", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.press(screen.getByLabelText("Cancel ending the shift"));
  expect(screen.getByLabelText("End shift")).toBeTruthy();
  expect(screen.queryByLabelText("Counted cash in pesos")).toBeNull();
});

it("closes once when Confirm is tapped twice before the first tap lands", async () => {
  let finish: () => void = () => {};
  jest.mocked(closeShift).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  finish();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Shift ended", expect.any(String)));
  expect(closeShift).toHaveBeenCalledTimes(1);
});

it("reads a decimal-comma count the way the tablet's keypad typed it", async () => {
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125,00");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ closingCount: 125 })));
});

it("treats a close that already landed as ended when the retry finds no open shift", async () => {
  jest.mocked(closeShift).mockRejectedValue(new Error("The request timed out."));
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  jest.mocked(fetchOpenShift).mockResolvedValue(null);
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Shift ended", expect.any(String)));
  expect(screen.getByText("Start your shift")).toBeTruthy();
});

describe("clock in", () => {
  beforeEach(() => {
    jest.mocked(loadOpenShift).mockResolvedValue(null);
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
    finish({ id: "new", outletId: null, staffUserId: "cashier", staffName: "cashier@store.ph", status: "open", openingFloat: 500, openedAt: "2026-01-01T09:00:00Z", closedAt: null, closingCount: null, expectedCash: null, note: null } as never);
    await waitFor(() => expect(screen.getByText("My shift")).toBeTruthy());
    expect(openShift).toHaveBeenCalledTimes(1);
  });

  it("opens with the float written as the cashier typed it", async () => {
    jest.mocked(openShift).mockResolvedValue({ id: "new", outletId: null, staffUserId: "cashier", staffName: "x", status: "open", openingFloat: 1500, openedAt: "2026-01-01T09:00:00Z", closedAt: null, closingCount: null, expectedCash: null, note: null });
    const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
    await waitFor(() => expect(screen.getByLabelText("Start shift")).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText("Opening float in pesos"), "₱1,500");
    fireEvent.press(screen.getByLabelText("Start shift"));
    await waitFor(() => expect(openShift).toHaveBeenCalledWith("tenant", expect.objectContaining({ openingFloat: 1500, staffName: "cashier@store.ph" })));
  });
});

it("does not claim a timed-out close landed when the follow-up read also fails", async () => {
  jest.mocked(closeShift).mockRejectedValue(new Error("The request timed out."));
  jest.mocked(fetchOpenShift).mockRejectedValue(new Error("offline"));
  const screen = render(<ShiftCard orders={orders} pageLimit={200} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Could not end the shift", "The request timed out."));
  expect(screen.getByText("My shift")).toBeTruthy();
});
