/**
 * One clock for every card on a board.
 *
 * The kitchen board used to hold `nowMs` in its own state and re-render the
 * whole screen — every ticket, the all-day strip, the header — twice a minute
 * just to redraw the timers. The ticker lives in a context instead: the
 * provider ticks, only the cards that read the clock re-render, and the
 * board above them stays put.
 */
import React from "react";
import { Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { TickerProvider, useTickerNow } from "./TickerProvider";

function Clock({ onRender }: { onRender?: (nowMs: number) => void }) {
  const nowMs = useTickerNow();
  onRender?.(nowMs);
  return <Text testID="clock">{String(nowMs)}</Text>;
}

describe("TickerProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-06T10:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("re-renders readers of the clock on each tick, not the board around them", () => {
    const boardRenders = jest.fn();
    const clockRenders = jest.fn();
    function Board() {
      boardRenders();
      return (
        <TickerProvider intervalMs={30_000}>
          <Clock onRender={clockRenders} />
        </TickerProvider>
      );
    }
    render(<Board />);
    const start = Date.now();
    expect(screen.getByTestId("clock").props.children).toBe(String(start));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getByTestId("clock").props.children).toBe(String(start + 30_000));
    expect(clockRenders).toHaveBeenCalledTimes(2);
    expect(boardRenders).toHaveBeenCalledTimes(1);
  });

  it("stops ticking once unmounted", () => {
    const clockRenders = jest.fn();
    const view = render(
      <TickerProvider intervalMs={1_000}>
        <Clock onRender={clockRenders} />
      </TickerProvider>,
    );
    view.unmount();

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    expect(clockRenders).toHaveBeenCalledTimes(1);
  });

  it("falls back to the wall clock with no provider, so cards render standalone", () => {
    render(<Clock />);
    expect(screen.getByTestId("clock").props.children).toBe(String(Date.now()));
  });
});
