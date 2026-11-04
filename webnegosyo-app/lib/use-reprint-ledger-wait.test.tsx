/**
 * The Drawer's "Reprint" opens the order screen, which prints once the
 * payments ledger has loaded so the copy says what was paid. Offline the
 * ledger may never answer: after REPRINT_LEDGER_WAIT_MS the reprint goes
 * ahead without it (the no-ledger receipt) instead of waiting forever.
 */
import { act, renderHook } from "@testing-library/react-native";
import { REPRINT_LEDGER_WAIT_MS, useReprintLedgerWait } from "./use-reprint-ledger-wait";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useReprintLedgerWait", () => {
  it("gives up on the ledger after about 5 seconds of waiting", () => {
    expect(REPRINT_LEDGER_WAIT_MS).toBe(5000);
    const { result } = renderHook(() => useReprintLedgerWait(true));
    expect(result.current).toBe(false);
    act(() => {
      jest.advanceTimersByTime(REPRINT_LEDGER_WAIT_MS - 1);
    });
    expect(result.current).toBe(false);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it("never fires while nothing is waiting, and starts over on the next wait", () => {
    const { result, rerender } = renderHook(({ isWaiting }) => useReprintLedgerWait(isWaiting), {
      initialProps: { isWaiting: false },
    });
    act(() => {
      jest.advanceTimersByTime(REPRINT_LEDGER_WAIT_MS * 2);
    });
    expect(result.current).toBe(false);

    rerender({ isWaiting: true });
    act(() => {
      jest.advanceTimersByTime(REPRINT_LEDGER_WAIT_MS);
    });
    expect(result.current).toBe(true);

    rerender({ isWaiting: false });
    expect(result.current).toBe(false);
  });
});
