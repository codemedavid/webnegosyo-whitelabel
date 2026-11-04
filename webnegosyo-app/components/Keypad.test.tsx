/**
 * The shared pad in its three modes (06 §5 "Keypad"): amount keeps the
 * Expenses behaviour (00, long-press 00 = centavos, long-press ⌫ = clear),
 * count swaps 00 for Next, pin has neither and no long-press shortcuts.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("amount mode: 00 and the Expenses long-presses", () => {
    const onKey = jest.fn();
    const { getByTestId, queryByTestId } = render(<Keypad mode="amount" onKey={onKey} />);
    fireEvent.press(getByTestId("keypad-7"));
    fireEvent.press(getByTestId("keypad-00"));
    fireEvent(getByTestId("keypad-00"), "longPress");
    fireEvent(getByTestId("keypad-backspace"), "longPress");
    expect(onKey.mock.calls.map(([key]) => key)).toEqual(["7", "00", "decimal", "clear"]);
    expect(queryByTestId("keypad-next")).toBeNull();
  });

  it("count mode: Next where 00 was, labelled by the caller", () => {
    const onKey = jest.fn();
    const { getByTestId, queryByTestId, getByLabelText } = render(<Keypad mode="count" onKey={onKey} nextLabel="Done" />);
    expect(queryByTestId("keypad-00")).toBeNull();
    fireEvent.press(getByLabelText("Done"));
    fireEvent(getByTestId("keypad-backspace"), "longPress");
    expect(onKey.mock.calls.map(([key]) => key)).toEqual(["next", "clear"]);
  });

  it("count mode: a disabled Next does not fire", () => {
    const onKey = jest.fn();
    const { getByTestId } = render(<Keypad mode="count" onKey={onKey} isNextDisabled />);
    fireEvent.press(getByTestId("keypad-next"));
    expect(onKey).not.toHaveBeenCalled();
  });

  it("pin mode: digits and delete only, no shortcuts", () => {
    const onKey = jest.fn();
    const { getByTestId, queryByTestId } = render(<Keypad mode="pin" onKey={onKey} />);
    expect(queryByTestId("keypad-00")).toBeNull();
    expect(queryByTestId("keypad-next")).toBeNull();
    fireEvent(getByTestId("keypad-backspace"), "longPress");
    fireEvent.press(getByTestId("keypad-4"));
    expect(onKey.mock.calls.map(([key]) => key)).toEqual(["4"]);
  });

  it("a disabled pad sends nothing", () => {
    const onKey = jest.fn();
    const { getByTestId } = render(<Keypad mode="amount" onKey={onKey} isDisabled />);
    fireEvent.press(getByTestId("keypad-1"));
    expect(onKey).not.toHaveBeenCalled();
  });
});
