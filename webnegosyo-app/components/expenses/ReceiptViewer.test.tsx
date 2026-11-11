import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ReceiptViewer } from "./ReceiptViewer";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const items = [
  { key: "r1", uri: "https://signed/1", isWaiting: false },
  { key: "q1", uri: "file:///q1.jpg", isWaiting: true },
];

function swipeTo(screen: ReturnType<typeof render>, page: number, width: number) {
  fireEvent(screen.getByTestId("receipt-pager"), "momentumScrollEnd", {
    nativeEvent: { contentOffset: { x: page * width, y: 0 }, layoutMeasurement: { width, height: 800 } },
  });
}

it("opens on the tapped receipt and counts as you swipe", () => {
  const screen = render(<ReceiptViewer items={items} initialIndex={0} visible onClose={jest.fn()} />);
  expect(screen.getByText("1 of 2")).toBeTruthy();
  expect(screen.queryByText("Waiting to upload")).toBeNull();

  swipeTo(screen, 1, 390);
  expect(screen.getByText("2 of 2")).toBeTruthy();
  expect(screen.getByText("Waiting to upload")).toBeTruthy();
});

it("starts where it was asked to", () => {
  const screen = render(<ReceiptViewer items={items} initialIndex={1} visible onClose={jest.fn()} />);
  expect(screen.getByText("2 of 2")).toBeTruthy();
});

it("never counts past the ends", () => {
  const screen = render(<ReceiptViewer items={items} initialIndex={0} visible onClose={jest.fn()} />);
  swipeTo(screen, 7, 390);
  expect(screen.getByText("2 of 2")).toBeTruthy();
});

it("hides the counter for one receipt and closes from the button", () => {
  const onClose = jest.fn();
  const screen = render(<ReceiptViewer items={items.slice(0, 1)} initialIndex={0} visible onClose={onClose} />);
  expect(screen.queryByText("1 of 1")).toBeNull();
  fireEvent.press(screen.getByLabelText("Close receipt"));
  expect(onClose).toHaveBeenCalledTimes(1);
});
