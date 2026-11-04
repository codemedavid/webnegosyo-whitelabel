/**
 * "Give these a category": a pay-out is given a category once. After a save
 * it leaves the list at once (no second sort before the re-read), the owner
 * is told it worked, a pay-out another phone already sorted is said plainly,
 * and Android back steps back instead of closing the sheet.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ExpenseWriteError, sortDrawerPayout } from "../../lib/expenses/expense-service";
import type { ExpenseCategory, UnsortedPayout } from "../../lib/expenses/types";
import { SortPayoutsSheet } from "./SortPayoutsSheet";

jest.mock("../../stores/auth-store", () => ({ useAuthStore: { getState: () => ({ isDemo: false }) } }));
jest.mock("../../lib/expenses/actor-name", () => ({ readActorName: jest.fn(async () => "Ana") }));
jest.mock("../../lib/expenses/expense-client", () => ({ liveExpenseDb: {} }));
jest.mock("../../lib/expenses/expense-service", () => {
  const actual = jest.requireActual("../../lib/expenses/expense-service");
  return { ...actual, sortDrawerPayout: jest.fn() };
});

function category(id: string, name: string): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group: "ingredients", needsNote: false, sortOrder: 0, archivedAt: null };
}
const categories = [
  category("ice", "Ice (Yelo)"),
  category("lpg", "Gas / LPG"),
  ...Array.from({ length: 8 }, (_, index) => category(`extra-${index}`, `Extra ${index}`)),
];

function payout(movementId: string, amountCents: number, reason: string): UnsortedPayout {
  return { movementId, shiftId: "s1", outletId: null, amountCents, reason, recordedByName: "Ben", createdAt: "2026-10-21T02:00:00Z" };
}
const payouts = [payout("m1", 12_500, "yelo"), payout("m2", 90_000, "gasul")];

function renderSheet(onSorted = jest.fn(), onClose = jest.fn()) {
  render(<SortPayoutsSheet payouts={payouts} categories={categories} recent={[]} onClose={onClose} onSorted={onSorted} />);
  return { onSorted, onClose };
}

function pressBack() {
  const { Modal: NativeModal } = jest.requireActual("react-native") as typeof import("react-native");
  act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());
}

async function sortFirstAsIce() {
  fireEvent.press(screen.getByLabelText("Give a category to ₱125.00: yelo"));
  fireEvent.press(screen.getByLabelText("Ice (Yelo)"));
  fireEvent.press(screen.getByTestId("sort-save"));
  await waitFor(() => expect(screen.getByText("Give these a category")).toBeTruthy());
}

beforeEach(() => jest.clearAllMocks());

it("takes a sorted pay-out off the list at once and says it worked", async () => {
  // Arrange
  jest.mocked(sortDrawerPayout).mockResolvedValue("exp-1");
  const { onSorted } = renderSheet();

  // Act
  await sortFirstAsIce();

  // Assert
  expect(screen.queryByLabelText("Give a category to ₱125.00: yelo")).toBeNull();
  expect(screen.getByLabelText("Give a category to ₱900.00: gasul")).toBeTruthy();
  expect(screen.getByText("Saved ₱125 as Ice.")).toBeTruthy();
  expect(onSorted).toHaveBeenCalledTimes(1);
});

it("treats a pay-out sorted elsewhere as done, without an error", async () => {
  jest.mocked(sortDrawerPayout).mockRejectedValue(new ExpenseWriteError("That pay-out was already sorted.", { code: "23505" }));
  const { onSorted } = renderSheet();

  await sortFirstAsIce();

  expect(screen.queryByLabelText("Give a category to ₱125.00: yelo")).toBeNull();
  expect(screen.getByText("That pay-out already had a category.")).toBeTruthy();
  expect(onSorted).toHaveBeenCalledTimes(1);
});

it("keeps the pay-out and shows the reason when the save fails", async () => {
  jest.mocked(sortDrawerPayout).mockRejectedValue(new ExpenseWriteError("No connection."));
  renderSheet();

  fireEvent.press(screen.getByLabelText("Give a category to ₱125.00: yelo"));
  fireEvent.press(screen.getByLabelText("Ice (Yelo)"));
  fireEvent.press(screen.getByTestId("sort-save"));

  await waitFor(() => expect(screen.getByText("No connection.")).toBeTruthy());
  expect(screen.getByTestId("sort-save")).toBeTruthy();
});

it("Android back steps from all categories to the pay-out, then to the list, then closes", () => {
  const { onClose } = renderSheet();
  fireEvent.press(screen.getByLabelText("Give a category to ₱125.00: yelo"));
  fireEvent.press(screen.getByTestId("category-all"));
  expect(screen.getByText("Pick a category")).toBeTruthy();

  pressBack();
  expect(screen.getByTestId("sort-save")).toBeTruthy();

  pressBack();
  expect(screen.getByText("Give these a category")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();

  pressBack();
  expect(onClose).toHaveBeenCalledTimes(1);
});
