/**
 * The React half of the platform read path, exercised with renderHook.
 *
 * Two defects pinned here:
 *  1. `isLoading` armed once at mount and never again — switching store or
 *     period silently showed the PREVIOUS tenant/period's numbers with no
 *     loading state until the new fetch landed.
 *  2. A platform read that hangs (GoTrue auth-lock stall) kept the screen in
 *     its loading state forever instead of surfacing an error.
 */

const mockRunPlatformQuery = jest.fn();

jest.mock("../supabase", () => ({
  __esModule: true,
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));

jest.mock("./supabase-adapter", () => ({
  __esModule: true,
  runPlatformQuery: (...args: unknown[]) => mockRunPlatformQuery(...args),
}));

import { renderHook, waitFor, act } from "@testing-library/react-native";
import { usePlatformQuery } from "./use-platform-query";
import type { BranchScope } from "../branch-scope";

const ALL: BranchScope = { kind: "all" };

describe("usePlatformQuery — loading state", () => {
  beforeEach(() => {
    mockRunPlatformQuery.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("re-arms isLoading when the query args change", async () => {
    mockRunPlatformQuery.mockResolvedValue("first");
    const { result, rerender } = renderHook(
      ({ args }: { args: Record<string, unknown> }) =>
        usePlatformQuery("orders:getDashboardStatsByPeriod", args, "tenant-1", ALL),
      { initialProps: { args: { startDate: 1 } } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The next period's fetch is in flight — the screen must say "loading",
    // not present last period's numbers as if they were this period's.
    mockRunPlatformQuery.mockImplementation(() => new Promise(() => {}));
    rerender({ args: { startDate: 2 } });

    expect(result.current.isLoading).toBe(true);
  });

  it("re-arms isLoading when the tenant changes", async () => {
    mockRunPlatformQuery.mockResolvedValue("store-a");
    const { result, rerender } = renderHook(
      ({ tenantId }: { tenantId: string }) =>
        usePlatformQuery("orders:getOrders", {}, tenantId, ALL),
      { initialProps: { tenantId: "tenant-a" } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockRunPlatformQuery.mockImplementation(() => new Promise(() => {}));
    rerender({ tenantId: "tenant-b" });

    expect(result.current.isLoading).toBe(true);
  });

  it("surfaces an error instead of loading forever when the read hangs", async () => {
    jest.useFakeTimers();
    mockRunPlatformQuery.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() =>
      usePlatformQuery("orders:getOrders", {}, "tenant-1", ALL)
    );

    await act(async () => {
      jest.advanceTimersByTime(13000);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toMatch(/timed out/i);
    jest.useRealTimers();
  });
});
