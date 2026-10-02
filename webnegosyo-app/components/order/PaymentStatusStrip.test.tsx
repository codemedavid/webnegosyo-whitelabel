import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PaymentStatusStrip } from "./PaymentStatusStrip";

describe("PaymentStatusStrip", () => {
  it("says an order is unpaid, how much is due, and offers to collect it", () => {
    const onCollect = jest.fn();
    render(<PaymentStatusStrip isUnpaid balanceDue={450} isPayLater={false} onCollect={onCollect} />);
    expect(screen.getByText("Unpaid · ₱450.00 due")).toBeTruthy();
    fireEvent.press(screen.getByText("Collect"));
    expect(onCollect).toHaveBeenCalled();
  });

  it("names a pay-later sale from the register", () => {
    render(<PaymentStatusStrip isUnpaid balanceDue={450} isPayLater onCollect={jest.fn()} />);
    expect(screen.getByText(/Rung up as “pay later”/)).toBeTruthy();
  });

  it("hides the button when this person cannot collect here", () => {
    render(<PaymentStatusStrip isUnpaid balanceDue={450} isPayLater={false} />);
    expect(screen.queryByText("Collect")).toBeNull();
  });

  it("says paid, and nothing else, once the bill is settled", () => {
    render(<PaymentStatusStrip isUnpaid={false} balanceDue={0} isPayLater onCollect={jest.fn()} />);
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.queryByText("Collect")).toBeNull();
  });
});
