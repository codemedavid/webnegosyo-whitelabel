/**
 * `useDiningTables` on the shared cache: two reads keyed by tenant, joined
 * into one result, re-read on demand.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const mockFetchTables = jest.fn();
const mockFetchSeatings = jest.fn();

jest.mock("./tables-service", () => ({
  DINING_TABLES_RESOURCE: "dining-tables",
  TABLE_SEATINGS_RESOURCE: "table-seatings",
  fetchDiningTables: (...args: unknown[]) => mockFetchTables(...args),
  fetchOpenSeatings: (...args: unknown[]) => mockFetchSeatings(...args),
  fetchOutletSlug: jest.fn(),
}));

jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => true,
  NavigationContext: jest.requireActual("react").createContext(null),
}));

import { createAppQueryClient } from "../query/query-client";
import { useAuthStore } from "../../stores/auth-store";
import { invalidateTables, useDiningTables } from "./use-dining-tables";

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TABLE = {
  id: "t1",
  tenantId: "tenant-1",
  outletId: null,
  label: "12",
  seats: 4,
  shape: "square" as const,
  size: "md" as const,
  zone: null,
  posX: 0.2,
  posY: 0.2,
  sortOrder: 0,
  isActive: true,
};
const SEATING = { id: "s1", tableId: "t1", partySize: 2, seatedAt: 1, note: null };

beforeEach(() => {
  client = createAppQueryClient();
  mockFetchTables.mockReset().mockResolvedValue([TABLE]);
  mockFetchSeatings.mockReset().mockResolvedValue([SEATING]);
  useAuthStore.setState({ tenantId: "tenant-1" });
});

afterEach(() => {
  client.clear();
});

describe("useDiningTables", () => {
  it("reads the tenant's tables and open seatings", async () => {
    const { result } = renderHook(() => useDiningTables(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchTables).toHaveBeenCalledWith("tenant-1");
    expect(mockFetchSeatings).toHaveBeenCalledWith("tenant-1");
    expect(result.current.tables).toEqual([TABLE]);
    expect(result.current.seatings).toEqual([SEATING]);
    expect(result.current.error).toBeNull();
  });

  it("reads nothing without a tenant", () => {
    useAuthStore.setState({ tenantId: null });
    const { result } = renderHook(() => useDiningTables(), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tables).toEqual([]);
    expect(mockFetchTables).not.toHaveBeenCalled();
  });

  it("surfaces a failed read as a message", async () => {
    mockFetchSeatings.mockRejectedValue(new Error("Could not load who is seated"));
    const { result } = renderHook(() => useDiningTables(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe("Could not load who is seated"));
    expect(result.current.tables).toEqual([TABLE]);
  });

  it("re-reads both halves on refetch and after an invalidation", async () => {
    const { result } = renderHook(() => useDiningTables(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refetch();
    });
    expect(mockFetchTables).toHaveBeenCalledTimes(2);
    expect(mockFetchSeatings).toHaveBeenCalledTimes(2);

    await act(async () => {
      await invalidateTables(client, "tenant-1");
    });
    await waitFor(() => expect(mockFetchSeatings).toHaveBeenCalledTimes(3));
    expect(mockFetchTables).toHaveBeenCalledTimes(3);
  });
});
