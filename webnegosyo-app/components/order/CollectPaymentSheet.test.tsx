/**
 * Taking payment on a placed order, driven through the rendered sheet.
 *
 * The rules are `lib/order-collect.ts`'s and are covered there. What this file
 * covers is the wiring — the part that was wrong the last four times money
 * broke in this app: a validated amount that never reaches the mutation, a
 * refusal the cashier never sees, a submit button that fires twice.
 *
 * Nothing is mocked but the caller's own `onSubmit`. The validation, the
 * formatting and the disabled states are the shipping code.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CollectPaymentSheet } from "./CollectPaymentSheet";

const METHODS = [
  { id: "cash", name: "Cash" },
  { id: "gcash", name: "GCash" },
];

function renderSheet(props: Partial<React.ComponentProps<typeof CollectPaymentSheet>> = {}) {
  const onSubmit = jest.fn(async () => {});
  const onClose = jest.fn();
  render(
    <CollectPaymentSheet
      visible
      balanceDue={149}
      methods={METHODS}
      onSubmit={onSubmit}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSubmit, onClose };
}

describe("CollectPaymentSheet", () => {
  it("offers the full balance as the starting amount", () => {
    // The overwhelmingly common case is settling the whole bill; making the
    // cashier retype a figure already on screen is how the wrong one gets typed.
    renderSheet();

    expect(screen.getByDisplayValue("149.00")).toBeTruthy();
  });

  it("shows what is still owed", () => {
    renderSheet();

    expect(screen.getByText(/₱149\.00/)).toBeTruthy();
  });

  it("sends the typed amount to the caller", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.changeText(screen.getByLabelText("Amount to collect"), "50");
    fireEvent.press(screen.getByText("Record payment"));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 50 })),
    );
  });

  it("sends the chosen payment method along with the amount", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.press(screen.getByText("GCash"));
    fireEvent.press(screen.getByText("Record payment"));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ methodId: "gcash", methodName: "GCash" }),
      ),
    );
  });

  it("passes a reference through when the cashier gives one", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.changeText(screen.getByLabelText("Reference number"), "GC-8891");
    fireEvent.press(screen.getByText("Record payment"));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ reference: "GC-8891" }),
      ),
    );
  });

  it("omits an empty reference rather than sending a blank string", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.press(screen.getByText("Record payment"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].reference).toBeUndefined();
  });

  /**
   * The refusal the sheet exists to make visible. Over-collecting leaves the
   * merchant owing money back, unwound only by someone with the refund
   * permission.
   */
  it("refuses more than is owed, and says how much is owed", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.changeText(screen.getByLabelText("Amount to collect"), "500");
    fireEvent.press(screen.getByText("Record payment"));

    expect(await screen.findByText(/149\.00 is still owed/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses an amount that is not a number", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.changeText(screen.getByLabelText("Amount to collect"), "abc");
    fireEvent.press(screen.getByText("Record payment"));

    expect(await screen.findByText(/as a number/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the refusal once the amount is corrected", async () => {
    renderSheet();

    fireEvent.changeText(screen.getByLabelText("Amount to collect"), "500");
    fireEvent.press(screen.getByText("Record payment"));
    await screen.findByText(/still owed/i);

    fireEvent.changeText(screen.getByLabelText("Amount to collect"), "100");

    await waitFor(() => expect(screen.queryByText(/still owed/i)).toBeNull());
  });

  /** A double-tap on a slow connection is two payments against one bill. */
  it("does not submit twice while the first is still in flight", async () => {
    let release: () => void = () => {};
    const onSubmit = jest.fn(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    render(
      <CollectPaymentSheet
        visible
        balanceDue={149}
        methods={METHODS}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText("Record payment"));
    fireEvent.press(screen.getByText("Recording..."));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    release();
  });

  it("closes when the cashier backs out", () => {
    const { onClose, onSubmit } = renderSheet();

    fireEvent.press(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
