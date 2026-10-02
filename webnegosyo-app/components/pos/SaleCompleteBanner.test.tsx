import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SALE_NOTICE_MS, SaleCompleteBanner } from "./SaleCompleteBanner";
import { usePosLastSaleStore } from "../../stores/pos-last-sale-store";

const paid = {
  orderId: "order-1",
  notice: { tone: "paid" as const, title: "Give ₱50.00 change", detail: "₱450.00 sale saved · paid" },
  canOpenOrder: true,
};

beforeEach(() => {
  jest.useFakeTimers();
  usePosLastSaleStore.setState({ lastSale: null });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("SaleCompleteBanner", () => {
  it("renders nothing when no sale has just finished", () => {
    render(<SaleCompleteBanner onOpenOrder={jest.fn()} />);
    expect(screen.queryByTestId("sale-complete-banner")).toBeNull();
  });

  it("shows what the cashier must do next, and opens the order", () => {
    const onOpenOrder = jest.fn();
    act(() => usePosLastSaleStore.getState().show(paid));
    render(<SaleCompleteBanner onOpenOrder={onOpenOrder} />);

    expect(screen.getByText("Give ₱50.00 change")).toBeTruthy();
    expect(screen.getByText("₱450.00 sale saved · paid")).toBeTruthy();
    fireEvent.press(screen.getByText("View order"));
    expect(onOpenOrder).toHaveBeenCalledWith("order-1");
  });

  it("hides the order link for a sale kept on this device", () => {
    act(() => usePosLastSaleStore.getState().show({ ...paid, canOpenOrder: false }));
    render(<SaleCompleteBanner onOpenOrder={jest.fn()} />);
    expect(screen.queryByText("View order")).toBeNull();
  });

  it("goes away on its own, and on the close button", () => {
    act(() => usePosLastSaleStore.getState().show(paid));
    render(<SaleCompleteBanner onOpenOrder={jest.fn()} />);
    act(() => {
      jest.advanceTimersByTime(SALE_NOTICE_MS);
    });
    expect(screen.queryByTestId("sale-complete-banner")).toBeNull();

    act(() => usePosLastSaleStore.getState().show(paid));
    fireEvent.press(screen.getByLabelText("Dismiss"));
    expect(screen.queryByTestId("sale-complete-banner")).toBeNull();
  });

  it("holds the order link while the sale is still being saved", () => {
    act(() => usePosLastSaleStore.getState().show(paid));
    const { rerender } = render(
      <SaleCompleteBanner onOpenOrder={jest.fn()} isSaving={() => true} />,
    );
    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.queryByText("View order")).toBeNull();

    rerender(<SaleCompleteBanner onOpenOrder={jest.fn()} isSaving={() => false} />);
    expect(screen.getByText("View order")).toBeTruthy();
  });
});
