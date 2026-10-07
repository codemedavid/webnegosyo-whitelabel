/**
 * A keyed read that keeps the previous key's data on screen while the next
 * loads — the daily report's day arrows. Without it every arrow tap blanked
 * the screen to a spinner, and two quick taps raced their responses.
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createAppQueryClient } from "./query-client";
import { useResourceKeepPrevious } from "./use-resource-keep-previous";
import { resourceKey } from "../backends/query-keys";

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createAppQueryClient();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useResourceKeepPrevious", () => {
  it("keeps the previous day's report visible while the next day loads", async () => {
    let release: (value: string) => void = () => {};
    const fetcher = jest.fn((day: string) =>
      day === "d1"
        ? Promise.resolve("report-d1")
        : new Promise<string>((resolve) => {
            release = resolve;
          })
    );

    const { result, rerender } = renderHook(
      ({ day }: { day: string }) =>
        useResourceKeepPrevious(resourceKey("report", "t1", day), () => fetcher(day)),
      { wrapper, initialProps: { day: "d1" } }
    );
    await waitFor(() => expect(result.current.data).toBe("report-d1"));
    expect(result.current.isPlaceholderData).toBe(false);

    rerender({ day: "d2" });
    expect(result.current.data).toBe("report-d1");
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);

    release("report-d2");
    await waitFor(() => expect(result.current.data).toBe("report-d2"));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it("is idle on a null key", () => {
    const fetcher = jest.fn(async () => "x");
    const { result } = renderHook(() => useResourceKeepPrevious(null, fetcher), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["another tenant", resourceKey("report", "t2", "d2")],
    ["another resource", resourceKey("inventory", "t1", "d2")],
    ["a disabled read", null],
  ])("clears the previous report when switching to %s", async (_label, nextKey) => {
    const fetcher = jest.fn<Promise<string>, []>().mockResolvedValueOnce("private-report");
    fetcher.mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: ReturnType<typeof resourceKey> | null }) =>
        useResourceKeepPrevious(queryKey, fetcher),
      { wrapper, initialProps: { queryKey: resourceKey("report", "t1", "d1") } }
    );
    await waitFor(() => expect(result.current.data).toBe("private-report"));

    rerender({ queryKey: nextKey });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.isLoading).toBe(nextKey !== null);
  });
});
