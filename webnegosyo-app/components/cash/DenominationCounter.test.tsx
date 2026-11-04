/**
 * The drawer count a cashier does by hand at the end of every shift. What is
 * pinned: steppers and the keypad both produce the count the database will
 * total (lib/cash/denominations), Next walks the rows in fanning order, holding
 * + repeats, coins can be counted by total, and the running total a screen
 * reader hears is throttled rather than read per tap.
 */
import React, { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { countTotalCents, type DenominationCounts } from "../../lib/cash/denominations";
import { DenominationCounter, type DenominationCounterProps } from "./DenominationCounter";

let latest: DenominationCounts = {};

function Harness(props: Partial<DenominationCounterProps>) {
  const [counts, setCounts] = useState<DenominationCounts>(props.value ?? {});
  return (
    <DenominationCounter
      isTablet={false}
      {...props}
      value={counts}
      onChange={(next) => {
        latest = next;
        setCounts(next);
      }}
    />
  );
}

// Every test runs on fake timers: the hold-repeat and the throttled spoken
// total use plain timers, and a real one firing after a test ends would update
// state outside act().
beforeEach(() => {
  latest = {};
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe("DenominationCounter", () => {
  it("lists bills then coins, biggest first, with 5¢/1¢ behind More coins", () => {
    const { getByTestId, queryByTestId } = render(<Harness />);
    expect(getByTestId("denomination-b1000")).toBeTruthy();
    expect(getByTestId("denomination-b20")).toBeTruthy();
    expect(getByTestId("denomination-c20")).toBeTruthy();
    expect(queryByTestId("denomination-c005")).toBeNull();
    fireEvent.press(getByTestId("denomination-more-coins"));
    expect(getByTestId("denomination-c005")).toBeTruthy();
    expect(getByTestId("denomination-c001")).toBeTruthy();
  });

  it("+ and − step one piece and the total follows", () => {
    const { getByTestId, getByLabelText } = render(<Harness />);
    fireEvent(getByTestId("denomination-b100-plus"), "pressIn");
    fireEvent(getByTestId("denomination-b100-plus"), "pressOut");
    fireEvent(getByTestId("denomination-b100-plus"), "pressIn");
    fireEvent(getByTestId("denomination-b100-plus"), "pressOut");
    fireEvent(getByTestId("denomination-b100-minus"), "pressIn");
    fireEvent(getByTestId("denomination-b100-minus"), "pressOut");
    expect(latest).toEqual({ b100: 1 });
    expect(getByLabelText("₱100 bills, 1, 100 pesos")).toBeTruthy();
    expect(getByTestId("count-total-amount").props.accessibilityLabel).toBe("100 pesos");
  });

  it("holding + repeats after 400 ms, every 120 ms, until released", () => {
    const { getByTestId } = render(<Harness />);
    fireEvent(getByTestId("denomination-c1-plus"), "pressIn");
    act(() => jest.advanceTimersByTime(400 + 120 * 3));
    fireEvent(getByTestId("denomination-c1-plus"), "pressOut");
    act(() => jest.advanceTimersByTime(1000));
    expect(latest).toEqual({ c1: 4 });
  });

  it("tapping a count docks the keypad; digits type the count and Next moves down", () => {
    const { getByTestId, queryByTestId } = render(<Harness />);
    expect(queryByTestId("counter-key-next")).toBeNull();
    fireEvent.press(getByTestId("denomination-b100-count"));
    fireEvent.press(getByTestId("counter-key-1"));
    fireEvent.press(getByTestId("counter-key-2"));
    expect(latest).toEqual({ b100: 12 });
    fireEvent.press(getByTestId("counter-key-next"));
    expect(getByTestId("denomination-b50-count").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(getByTestId("counter-key-3"));
    expect(latest).toEqual({ b100: 12, b50: 3 });
    expect(countTotalCents(latest)).toBe(135000);
  });

  it("Next on the last row calls onDone", () => {
    const onDone = jest.fn();
    const { getByTestId, getByLabelText } = render(<Harness onDone={onDone} doneLabel="Next: GCash & cards" />);
    fireEvent.press(getByTestId("denomination-c025-count"));
    fireEvent.press(getByLabelText("Next: GCash & cards"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("coins counted by total: an amount, not pieces, and coin rows fold away", () => {
    const { getByTestId, queryByTestId, getByText } = render(<Harness />);
    fireEvent.press(getByTestId("denomination-by-total"));
    fireEvent.press(getByTestId("counter-key-4"));
    fireEvent.press(getByTestId("counter-key-5"));
    fireEvent(getByTestId("counter-key-00"), "longPress");
    fireEvent.press(getByTestId("counter-key-5"));
    expect(latest).toEqual({ loose_coins_cents: 4550 });
    expect(queryByTestId("denomination-c10")).toBeNull();
    expect(getByText("Counted by total")).toBeTruthy();
  });

  it("coin rows that hold pieces never fold away", () => {
    const { getByTestId } = render(<Harness value={{ c10: 2 }} />);
    fireEvent.press(getByTestId("denomination-by-total"));
    fireEvent.press(getByTestId("counter-key-9"));
    expect(latest).toEqual({ c10: 2, loose_coins_cents: 900 });
    expect(getByTestId("denomination-c10")).toBeTruthy();
  });

  it("a tablet keeps the keypad up from the start, on ₱1000", () => {
    const { getByTestId } = render(<Harness isTablet />);
    expect(getByTestId("denomination-b1000-count").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(getByTestId("counter-key-5"));
    expect(latest).toEqual({ b1000: 5 });
  });

  it("the spoken total is throttled to once per 1.5 s", () => {
    const { getByTestId } = render(<Harness />);
    const tap = () => {
      fireEvent(getByTestId("denomination-b20-plus"), "pressIn");
      fireEvent(getByTestId("denomination-b20-plus"), "pressOut");
    };
    tap();
    act(() => jest.advanceTimersByTime(0));
    expect(getByTestId("count-total-announcement").props.accessibilityLabel).toBe("Counted 20 pesos");
    tap();
    tap();
    act(() => jest.advanceTimersByTime(500));
    expect(getByTestId("count-total-announcement").props.accessibilityLabel).toBe("Counted 20 pesos");
    act(() => jest.advanceTimersByTime(1100));
    expect(getByTestId("count-total-announcement").props.accessibilityLabel).toBe("Counted 60 pesos");
  });

  it("shows the caller's hint under the total", () => {
    const { getByText } = render(<Harness hint="We'll compare after you finish." />);
    expect(getByText("We'll compare after you finish.")).toBeTruthy();
  });
});
