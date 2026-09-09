/**
 * A clock that ticks. The daily report resolved "today" once at mount, so a
 * merchant who left the tab open past midnight kept a stale "latest day" and
 * a dead forward arrow.
 */
import { renderHook, act } from "@testing-library/react-native";
import { useNowMs } from "./use-now-ms";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-05T10:00:00Z"));
});
afterEach(() => jest.useRealTimers());

describe("useNowMs", () => {
  it("starts at now and advances every interval", () => {
    const { result } = renderHook(() => useNowMs(60_000));
    const start = result.current;
    expect(start).toBe(Date.parse("2026-09-05T10:00:00Z"));

    act(() => {
      jest.advanceTimersByTime(59_999);
    });
    expect(result.current).toBe(start);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(start + 60_000);
  });

  it("stops ticking on unmount", () => {
    const { result, unmount } = renderHook(() => useNowMs(1_000));
    const start = result.current;
    unmount();
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(start);
  });
});
