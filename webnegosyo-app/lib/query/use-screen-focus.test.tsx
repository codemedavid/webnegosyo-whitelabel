/**
 * Refetch-on-focus for a screen that is already mounted.
 *
 * Tabs mount once and never unmount, so a query's own mount refetch never
 * fires again. The navigator's focus event stands in for it — but only when
 * the data is actually stale, or every tab switch would be a network round trip.
 * Outside a navigator (renderHook, tests) the hook is a no-op.
 */
import React from "react";
import { renderHook } from "@testing-library/react-native";
import { NavigationContext } from "@react-navigation/native";
import { shouldRefetchOnFocus, useRefetchOnScreenFocus } from "./use-screen-focus";

describe("shouldRefetchOnFocus", () => {
  it("is false while the data is younger than its stale window", () => {
    expect(shouldRefetchOnFocus({ dataUpdatedAt: 1_000, staleMs: 10_000, nowMs: 5_000 })).toBe(false);
  });

  it("is true once the stale window has elapsed", () => {
    expect(shouldRefetchOnFocus({ dataUpdatedAt: 1_000, staleMs: 10_000, nowMs: 11_001 })).toBe(true);
  });

  it("is true when nothing has ever been fetched", () => {
    expect(shouldRefetchOnFocus({ dataUpdatedAt: 0, staleMs: 10_000, nowMs: 5 })).toBe(true);
  });
});

function navigatorWrapper(focusListeners: Array<() => void>) {
  const navigation = {
    addListener: (_event: string, cb: () => void) => {
      focusListeners.push(cb);
      return () => {
        focusListeners.splice(focusListeners.indexOf(cb), 1);
      };
    },
  } as unknown as React.ContextType<typeof NavigationContext>;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
  };
}

describe("useRefetchOnScreenFocus", () => {
  it("does nothing outside a navigator", () => {
    const refetch = jest.fn(async () => {});
    renderHook(() =>
      useRefetchOnScreenFocus({ enabled: true, staleMs: 0, dataUpdatedAt: 0, isFetching: false, refetch })
    );
    expect(refetch).not.toHaveBeenCalled();
  });

  it("refetches on focus when stale and not when fresh", () => {
    const listeners: Array<() => void> = [];
    const refetch = jest.fn(async () => {});
    const { rerender } = renderHook(
      ({ dataUpdatedAt }: { dataUpdatedAt: number }) =>
        useRefetchOnScreenFocus({ enabled: true, staleMs: 10_000, dataUpdatedAt, isFetching: false, refetch }),
      { initialProps: { dataUpdatedAt: Date.now() }, wrapper: navigatorWrapper(listeners) }
    );
    expect(listeners).toHaveLength(1);

    listeners[0]();
    expect(refetch).not.toHaveBeenCalled();

    rerender({ dataUpdatedAt: Date.now() - 20_000 });
    listeners[0]();
    expect(refetch).toHaveBeenCalledTimes(1);
    // The listener reads the latest props without re-subscribing.
    expect(listeners).toHaveLength(1);
  });

  it("never restarts a read that is already in flight", () => {
    const listeners: Array<() => void> = [];
    const refetch = jest.fn(async () => {});
    renderHook(
      () =>
        useRefetchOnScreenFocus({ enabled: true, staleMs: 0, dataUpdatedAt: 0, isFetching: true, refetch }),
      { wrapper: navigatorWrapper(listeners) }
    );
    listeners[0]();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("stays quiet while disabled and unsubscribes on unmount", () => {
    const listeners: Array<() => void> = [];
    const refetch = jest.fn(async () => {});
    const { unmount } = renderHook(
      () => useRefetchOnScreenFocus({ enabled: false, staleMs: 0, dataUpdatedAt: 0, isFetching: false, refetch }),
      { wrapper: navigatorWrapper(listeners) }
    );
    listeners.forEach((cb) => cb());
    expect(refetch).not.toHaveBeenCalled();

    unmount();
    expect(listeners).toHaveLength(0);
  });
});
