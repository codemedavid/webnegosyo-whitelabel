import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { ShiftCard } from "./ShiftCard";
import { closeShift, loadOpenShift } from "../lib/shift-service";

const mockSession = { tenantId: "tenant", userId: "cashier", isDemo: false };
let mockLedgerError: string | null = null;
const mockPayments = [{ orderId: "order", kind: "charge", amount: 25, paymentMethodName: "Cash", recordedBy: "cashier", _creationTime: Date.parse("2026-01-01T10:00:00Z") }];
jest.mock("expo-router", () => ({ useFocusEffect: (effect: React.EffectCallback) => { const { useEffect } = jest.requireActual<typeof React>("react"); useEffect(effect, [effect]); } }));
jest.mock("../stores/auth-store", () => ({ useAuthStore: Object.assign((select: (state: typeof mockSession) => unknown) => select(mockSession), { getState: () => mockSession }) }));
jest.mock("../lib/hooks", () => ({ useSafeQuery: () => ({ data: mockLedgerError ? undefined : mockPayments, error: mockLedgerError, isMissingFunction: false }), useRefRoute: () => "platform" }));
jest.mock("../lib/supabase", () => ({ supabase: { auth: { getUser: jest.fn() } } }));
jest.mock("../lib/shift-service", () => ({ loadOpenShift: jest.fn(), closeShift: jest.fn(), openShift: jest.fn() }));

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
  const screen = render(<ShiftCard orders={orders} complete />);
  await waitFor(() => expect(screen.getByText(/my cash sales/)).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  await waitFor(() => expect(closeShift).toHaveBeenCalledWith("tenant", "shift", expect.objectContaining({ expectedCash: 125, closingCount: 125 })));
});

it.each(["unavailable", "truncated"])("does not close a shift with %s settlement history", async mode => {
  if (mode === "unavailable") mockLedgerError = "Connection lost";
  const screen = render(<ShiftCard orders={orders} complete={mode !== "truncated"} />);
  await waitFor(() => expect(screen.getByLabelText("End shift")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("End shift"));
  fireEvent.changeText(screen.getByLabelText("Counted cash in pesos"), "125");
  fireEvent.press(screen.getByLabelText("Confirm end of shift"));
  expect(closeShift).not.toHaveBeenCalled();
});
