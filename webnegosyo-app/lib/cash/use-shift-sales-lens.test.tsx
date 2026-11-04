/**
 * Shift sales is a screen that stays mounted: the lens used to be chosen once,
 * on mount, so a later visit with `?lens=mine` (End shift, My shifts) or an
 * account that lost Reports still opened on the old lens. It is re-derived on
 * every focus and whenever the param or the account's access changes.
 */
import { act, renderHook } from "@testing-library/react-native";

const mockFocus: { run: (() => void) | null } = { run: null };
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useFocusEffect: (effect: () => void) => {
      mockFocus.run = effect;
      useEffect(effect, [effect]);
    },
  };
});

import { useShiftSalesLens } from "./use-shift-sales-lens";

describe("useShiftSalesLens", () => {
  it("opens on the param, and follows a new ?lens= on the still-mounted screen", () => {
    const { result, rerender } = renderHook((props: { param: string | undefined; canSeeStore: boolean }) => useShiftSalesLens(props), {
      initialProps: { param: undefined as string | undefined, canSeeStore: true },
    });
    expect(result.current[0]).toBe("store");
    rerender({ param: "mine", canSeeStore: true });
    expect(result.current[0]).toBe("mine");
  });

  it("an account that can no longer see the store falls back to her own sales", () => {
    const { result, rerender } = renderHook((props: { param: string | undefined; canSeeStore: boolean }) => useShiftSalesLens(props), {
      initialProps: { param: undefined as string | undefined, canSeeStore: true },
    });
    rerender({ param: undefined, canSeeStore: false });
    expect(result.current[0]).toBe("mine");
  });

  it("the lens she picked holds while she stays, and is re-derived when she comes back", () => {
    const { result } = renderHook(() => useShiftSalesLens({ param: "mine", canSeeStore: true }));
    act(() => result.current[1]("drawer"));
    expect(result.current[0]).toBe("drawer");
    act(() => mockFocus.run?.());
    expect(result.current[0]).toBe("mine");
  });
});
