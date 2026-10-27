/**
 * The bill writes hand the services Manila's today (pause / resume refuse or
 * restart from it) and never pass the old "saved start" argument: the stored
 * bill decides (bills-contract §4).
 */
import { act, renderHook } from "@testing-library/react-native";

import { pauseBill, resumeBill, updateBill } from "../../../lib/expenses/bills-service";
import { billOf, BILL_TODAY } from "../../../lib/expenses/bills-fixtures";
import { useBillWrites } from "./use-bill-writes";

jest.mock("../../../lib/expenses/bills-service", () => ({
  createBill: jest.fn(),
  endBill: jest.fn(),
  linkExpenseToBill: jest.fn(),
  markBill: jest.fn(),
  pauseBill: jest.fn(async () => ({})),
  resumeBill: jest.fn(async () => ({})),
  unlinkExpenseFromBill: jest.fn(),
  unmarkBill: jest.fn(),
  updateBill: jest.fn(async () => ({})),
}));
jest.mock("../../../lib/expenses/expense-client", () => ({ liveExpenseDb: { db: "live" } }));
jest.mock("../../../lib/expenses/use-bills", () => ({ useInvalidateBills: () => jest.fn(async () => {}) }));
jest.mock("../../../lib/expenses/use-expenses", () => ({
  useExpenseTenant: () => "t1",
  useInvalidateExpenses: () => jest.fn(async () => {}),
}));
jest.mock("../detail/use-expense-detail-writes", () => ({ refuseInDemo: () => false }));

const DB = { db: "live" };

it("passes today to pause and resume", async () => {
  const { result } = renderHook(() => useBillWrites());

  await act(async () => {
    await result.current.pause("bill-rent", "2026-11-01", BILL_TODAY);
  });
  await act(async () => {
    await result.current.resume("bill-rent", BILL_TODAY);
  });

  expect(pauseBill).toHaveBeenCalledWith(DB, "t1", "bill-rent", "2026-11-01", BILL_TODAY);
  expect(resumeBill).toHaveBeenCalledWith(DB, "t1", "bill-rent", BILL_TODAY);
});

it("updates with the input and today only: the stored bill decides the start", async () => {
  const { result } = renderHook(() => useBillWrites());
  const input = { ...billOf(), outletId: null };

  await act(async () => {
    await result.current.update("bill-rent", input, BILL_TODAY);
  });

  expect(updateBill).toHaveBeenCalledWith(DB, "t1", "bill-rent", input, BILL_TODAY);
  expect(jest.mocked(updateBill).mock.calls[0]).toHaveLength(5);
});
