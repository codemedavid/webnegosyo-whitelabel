/**
 * The Orders tab's row is memoised on its order row and the shared callbacks.
 * These pin what that buys — an unrelated re-render of the list draws nothing
 * for an unchanged row — and what the busy flag does to the actions.
 */
import React from "react";
import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { OrderListRow, type OrderListRowOrder } from "./OrderListRow";

jest.mock("./OrderCard", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Text: RNText, TouchableOpacity } = jest.requireActual<typeof import("react-native")>("react-native");
  let renders = 0;
  const OrderCard = ReactActual.memo(function OrderCard(props: {
    order: { _id: string };
    onPress: () => void;
    nextStatusLabel?: string;
    onAdvance?: () => void;
    onCancel?: () => void;
  }) {
    renders += 1;
    return (
      <>
        <RNText testID="renders">{String(renders)}</RNText>
        <TouchableOpacity testID="open" onPress={props.onPress} />
        {props.onAdvance ? <TouchableOpacity testID="advance" onPress={props.onAdvance} /> : null}
        {props.onCancel ? <TouchableOpacity testID="cancel" onPress={props.onCancel} /> : null}
        <RNText testID="label">{props.nextStatusLabel ?? ""}</RNText>
      </>
    );
  });
  return { OrderCard, __resetRenders: () => (renders = 0) };
});

const order: OrderListRowOrder = {
  _id: "o1",
  _creationTime: 1,
  customerName: "Maria",
  total: 100,
  itemCount: 1,
  status: "pending",
};

function renderRow(props: Partial<React.ComponentProps<typeof OrderListRow>> = {}) {
  const handlers = { onOpen: jest.fn(), onAdvance: jest.fn(), onCancel: jest.fn() };
  const utils = render(
    <OrderListRow order={order} nextStatusLabel="Confirmed" isBusy={false} {...handlers} {...props} />,
  );
  return { ...utils, handlers };
}

beforeEach(() => {
  (jest.requireMock("./OrderCard") as { __resetRenders: () => void }).__resetRenders();
});

describe("OrderListRow", () => {
  it("routes taps to the id-based callbacks", () => {
    const { handlers } = renderRow();

    fireEvent.press(screen.getByTestId("open"));
    fireEvent.press(screen.getByTestId("advance"));
    fireEvent.press(screen.getByTestId("cancel"));

    expect(handlers.onOpen).toHaveBeenCalledWith("o1");
    expect(handlers.onAdvance).toHaveBeenCalledWith("o1");
    expect(handlers.onCancel).toHaveBeenCalledWith(order);
  });

  it("does not re-render the card when the parent re-renders with the same props", () => {
    const handlers = { onOpen: jest.fn(), onAdvance: jest.fn(), onCancel: jest.fn() };
    const { rerender } = render(
      <>
        <Text>first</Text>
        <OrderListRow order={order} nextStatusLabel="Confirmed" isBusy={false} {...handlers} />
      </>,
    );

    rerender(
      <>
        <Text>second</Text>
        <OrderListRow order={order} nextStatusLabel="Confirmed" isBusy={false} {...handlers} />
      </>,
    );

    expect(screen.getByTestId("renders").props.children).toBe("1");
  });

  it("re-renders when the order row itself changes", () => {
    const handlers = { onOpen: jest.fn(), onAdvance: jest.fn(), onCancel: jest.fn() };
    const { rerender } = render(
      <OrderListRow order={order} nextStatusLabel="Confirmed" isBusy={false} {...handlers} />,
    );

    rerender(
      <OrderListRow
        order={{ ...order, status: "confirmed" }}
        nextStatusLabel="Preparing"
        isBusy={false}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("renders").props.children).toBe("2");
    expect(screen.getByTestId("label").props.children).toBe("Preparing");
  });

  it("hides the advance and cancel actions while a change is in flight", () => {
    renderRow({ isBusy: true });

    expect(screen.queryByTestId("advance")).toBeNull();
    expect(screen.queryByTestId("cancel")).toBeNull();
    expect(screen.getByTestId("open")).toBeTruthy();
  });

  it("offers no cancel on a finished order", () => {
    renderRow({ order: { ...order, status: "delivered" }, nextStatusLabel: undefined });

    expect(screen.queryByTestId("cancel")).toBeNull();
    expect(screen.queryByTestId("advance")).toBeNull();
  });
});
