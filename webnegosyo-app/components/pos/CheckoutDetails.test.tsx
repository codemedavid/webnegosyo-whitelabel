import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CheckoutDetails } from "./CheckoutDetails";
import type { PosCheckoutField } from "../../lib/pos-checkout-fields";

const field = (overrides: Partial<PosCheckoutField>): PosCheckoutField => ({
  id: "f-landmark",
  orderTypeId: "ot-delivery",
  name: "Landmark",
  label: "Nearest landmark",
  type: "text",
  placeholder: null,
  options: [],
  role: "custom",
  ...overrides,
});

const TIME = field({ id: "f-time", name: "Time", label: "Preferred time", type: "select", options: ["3:00 PM", "4:00 PM"] });

function renderDetails(props: Partial<React.ComponentProps<typeof CheckoutDetails>> = {}) {
  const onAnswer = jest.fn();
  const onOpenDelivery = jest.fn();
  const view = render(
    <CheckoutDetails
      isDelivery
      delivery={{ fee: null, address: "", phone: "" }}
      deliveryFee={0}
      onOpenDelivery={onOpenDelivery}
      customFields={[field({}), TIME]}
      answers={{}}
      onAnswer={onAnswer}
      {...props}
    />,
  );
  return { ...view, onAnswer, onOpenDelivery };
}

describe("CheckoutDetails", () => {
  it("renders nothing for a non-delivery sale with no extra questions", () => {
    const { toJSON } = renderDetails({ isDelivery: false, customFields: [] });
    expect(toJSON()).toBeNull();
  });

  it("summarises delivery in one row that opens the delivery sheet", () => {
    const { onOpenDelivery } = renderDetails({
      delivery: { fee: 85, address: "12 Mabini St", phone: "0917 000 1234" },
      deliveryFee: 85,
    });

    expect(screen.getByText("12 Mabini St")).toBeTruthy();
    expect(screen.getByText("Fee ₱85.00 · 0917 000 1234")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Delivery to 12 Mabini St. Edit"));
    expect(onOpenDelivery).toHaveBeenCalled();
  });

  it("keeps the merchant's questions folded away until asked for", () => {
    renderDetails();

    expect(screen.getByText("Nearest landmark, Preferred time")).toBeTruthy();
    expect(screen.queryByLabelText("Nearest landmark, optional")).toBeNull();

    fireEvent.press(screen.getByText("More details"));
    expect(screen.getByLabelText("Nearest landmark, optional")).toBeTruthy();
  });

  it("answers a dropdown with a tap, and clears it with a second tap", () => {
    const { onAnswer, rerender } = renderDetails();
    fireEvent.press(screen.getByText("More details"));

    fireEvent.press(screen.getByText("3:00 PM"));
    expect(onAnswer).toHaveBeenLastCalledWith("Time", "3:00 PM");

    rerender(
      <CheckoutDetails
        isDelivery
        delivery={{ fee: null, address: "", phone: "" }}
        deliveryFee={0}
        onOpenDelivery={jest.fn()}
        customFields={[field({}), TIME]}
        answers={{ Time: "3:00 PM" }}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("1 of 2 answered")).toBeTruthy();
    fireEvent.press(screen.getByText("3:00 PM"));
    expect(onAnswer).toHaveBeenLastCalledWith("Time", "");
  });
});
