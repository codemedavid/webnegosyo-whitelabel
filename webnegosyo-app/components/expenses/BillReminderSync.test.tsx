/**
 * Bill reminders never outlive the session on this phone: sign-out clears the
 * auth store and navigates away in the same tick, so BillReminderSync may
 * unmount without ever rendering owner-less — its unmount must clear them.
 */
import React from "react";
import { act, render } from "@testing-library/react-native";

import { useAuthStore } from "../../stores/auth-store";
import { clearBillRemindersOnDevice, syncBillRemindersOnDevice } from "../../lib/expenses/bill-alerts-device";
import { forgetBills } from "../../lib/expenses/bill-ways-in";
import { BillReminderSync } from "./BillReminderSync";

jest.mock("../../lib/expenses/bill-alerts-device", () => ({
  clearBillRemindersOnDevice: jest.fn(() => Promise.resolve()),
  syncBillRemindersOnDevice: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../lib/expenses/bill-ways-in", () => ({ forgetBills: jest.fn(), rememberBills: jest.fn() }));
jest.mock("../../lib/expenses/use-bills", () => ({
  useBillBoard: () => ({ data: { bills: [], marks: [], payments: [] }, dataUpdatedAt: 0, isRefetching: false, refetch: jest.fn() }),
}));
jest.mock("../../lib/expenses/use-expenses", () => ({ useCanManageExpenses: () => true }));

const OWNER = {
  isLoading: false,
  isAuthenticated: true,
  isDemo: false,
  impersonatedTenantId: null,
  tenantId: "t1",
  userId: "u1",
};

beforeEach(() => {
  jest.clearAllMocks();
  act(() => useAuthStore.setState(OWNER));
});

it("keeps the owner's reminders in step while signed in", () => {
  render(<BillReminderSync />);
  expect(syncBillRemindersOnDevice).toHaveBeenCalledWith("t1:u1", { bills: [], marks: [], payments: [] });
  expect(clearBillRemindersOnDevice).not.toHaveBeenCalled();
});

it("clears every reminder when it unmounts after a sign-out it never re-rendered for", () => {
  // Arrange
  const view = render(<BillReminderSync />);

  // Act: the store is cleared and the screen goes away in the same tick.
  act(() => {
    useAuthStore.getState().clear();
    view.unmount();
  });

  // Assert
  expect(forgetBills).toHaveBeenCalled();
  expect(clearBillRemindersOnDevice).toHaveBeenCalledTimes(1);
});

it("leaves them alone when it unmounts with the session still there", () => {
  const view = render(<BillReminderSync />);
  view.unmount();
  expect(clearBillRemindersOnDevice).not.toHaveBeenCalled();
});
