/**
 * "Paid for: Rent · October" on the expense detail, and the way back from a
 * wrong link: "Not for this bill", asked first, never changing the money.
 */
import React from "react";
import { Alert, type AlertButton } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { PaidForCard } from "./BillDetailLink";

beforeEach(() => jest.restoreAllMocks());

function lastAlertButtons(spy: jest.SpyInstance): AlertButton[] {
  return (spy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
}

it("asks before taking the link off, and only Yes unlinks", () => {
  // Arrange
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const onUnlink = jest.fn();
  render(<PaidForCard text="Rent · October" onPress={jest.fn()} onUnlink={onUnlink} />);

  // Act
  fireEvent.press(screen.getByText("Not for this bill"));

  // Assert: the question, in plain words, then nothing happens until Yes.
  expect(alert).toHaveBeenCalledWith(
    "Not for this bill?",
    "This expense stays as it is. Rent · October goes back to Bills to pay.",
    expect.any(Array),
  );
  expect(onUnlink).not.toHaveBeenCalled();
  const buttons = lastAlertButtons(alert);
  buttons.find((button) => button.style === "cancel")?.onPress?.();
  expect(onUnlink).not.toHaveBeenCalled();
  buttons.find((button) => button.text === "Not for this bill")?.onPress?.();
  expect(onUnlink).toHaveBeenCalledTimes(1);
});

it("offers no unlink when there is nothing to undo (a voided expense, no access)", () => {
  const onPress = jest.fn();
  render(<PaidForCard text="Rent · October" onPress={onPress} />);
  expect(screen.queryByText("Not for this bill")).toBeNull();
  fireEvent.press(screen.getByTestId("expense-paid-for"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
