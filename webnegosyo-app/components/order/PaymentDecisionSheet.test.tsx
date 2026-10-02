import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PaymentDecisionSheet } from "./PaymentDecisionSheet";
import { paymentPromptCopy } from "../../lib/order-payment-prompt";

function renderSheet(props: Partial<React.ComponentProps<typeof PaymentDecisionSheet>> = {}) {
  const handlers = { onPaid: jest.fn(), onUnpaid: jest.fn(), onClose: jest.fn() };
  render(
    <PaymentDecisionSheet
      visible
      copy={paymentPromptCopy("confirm", { amount: 450, methodName: "GCash" })}
      summary={{ amount: 450, methodName: "GCash", reference: "GC-77" }}
      isBusy={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("PaymentDecisionSheet", () => {
  it("shows what the customer said about their payment before asking", () => {
    renderSheet();
    expect(screen.getByText("₱450.00")).toBeTruthy();
    expect(screen.getByText("GCash · Ref GC-77")).toBeTruthy();
    expect(screen.getByText("Has the customer paid ₱450.00?")).toBeTruthy();
  });

  it("answers yes and no through the two choices", () => {
    const { onPaid, onUnpaid } = renderSheet();
    fireEvent.press(screen.getByText("Yes — payment received"));
    fireEvent.press(screen.getByText("Not yet — confirm order only"));
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onUnpaid).toHaveBeenCalledTimes(1);
  });

  it("explains, instead of acting, when this person may not take the payment", () => {
    const { onPaid } = renderSheet({ paidDisabledReason: "You do not have permission to take payments." });
    expect(screen.getByText("You do not have permission to take payments.")).toBeTruthy();
    fireEvent.press(screen.getByText("Yes — payment received"));
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("locks both answers while one is being saved", () => {
    const { onPaid, onUnpaid } = renderSheet({ isBusy: true });
    fireEvent.press(screen.getByText("Yes — payment received"));
    fireEvent.press(screen.getByText("Not yet — confirm order only"));
    expect(onPaid).not.toHaveBeenCalled();
    expect(onUnpaid).not.toHaveBeenCalled();
    expect(screen.getByText("Saving...")).toBeTruthy();
  });

  it("says so when the order carries no payment method", () => {
    renderSheet({ summary: { amount: 450 } });
    expect(screen.getByText("No payment method chosen")).toBeTruthy();
  });
});
