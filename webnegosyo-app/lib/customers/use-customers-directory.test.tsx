/**
 * The Customers tab on the shared cache: the guest list with its suppressed
 * numbers, and the campaign due-states where the platform can send. The tab
 * never unmounts, so returning to it refetches only when the data is stale.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

// `requireActual` below pulls in the real campaigns-repo, and with it the
// Supabase client's AsyncStorage-backed session store, which has no native
// module under Jest.
// The real Supabase client is constructed at import time and refuses a blank
// URL; it is never called here, since every repo function is mocked below.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "test-anon-key",
        webAppUrl: "https://www.webnegosyo.com",
      },
    },
  },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

const mockListCustomers = jest.fn();
const mockListSuppressed = jest.fn();
const mockListCampaignRows = jest.fn();
const mockLastRuns = jest.fn();
jest.mock("../sms/customers-repo", () => ({
  listCustomers: (...args: unknown[]) => mockListCustomers(...args),
  listSuppressedPhones: (...args: unknown[]) => mockListSuppressed(...args),
}));
jest.mock("../sms/campaigns-repo", () => ({
  ...jest.requireActual("../sms/campaigns-repo"),
  listCampaignRows: (...args: unknown[]) => mockListCampaignRows(...args),
  lastRunAtByCampaign: (...args: unknown[]) => mockLastRuns(...args),
}));

import { createAppQueryClient } from "../query/query-client";
import { useCustomersDirectory } from "./use-customers-directory";
import type { SmsCustomer } from "../sms/types";

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ANA: SmsCustomer = {
  id: "c1",
  name: "Ana",
  phone_e164: "+639170000001",
  order_count: 2,
  total_spent: 500,
  last_order_at: null,
  channels_used: [],
  sms_consent: true,
  sms_opt_out: false,
};

beforeEach(() => {
  client = createAppQueryClient();
  mockListCustomers.mockReset().mockResolvedValue([ANA]);
  mockListSuppressed.mockReset().mockResolvedValue(["+639170000009"]);
  mockListCampaignRows.mockReset().mockResolvedValue([]);
  mockLastRuns.mockReset().mockResolvedValue({});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useCustomersDirectory", () => {
  it("loads the guests and the suppressed numbers, and skips campaigns where nothing can send", async () => {
    const { result } = renderHook(
      () => useCustomersDirectory("t1", { withCampaigns: false }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.customers).toEqual([ANA]);
    expect(result.current.suppressedPhones).toEqual(["+639170000009"]);
    expect(result.current.campaignStates).toEqual([]);
    expect(mockListCampaignRows).not.toHaveBeenCalled();
  });

  it("reads the campaigns where the platform can send", async () => {
    const { result } = renderHook(
      () => useCustomersDirectory("t1", { withCampaigns: true }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListCampaignRows).toHaveBeenCalledWith("t1");
  });

  it("patches one guest in place for an optimistic toggle", async () => {
    const { result } = renderHook(
      () => useCustomersDirectory("t1", { withCampaigns: false }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.patchCustomer("c1", (c) => ({ ...c, sms_opt_out: true }));
    });
    // The cache notifies its observers on a scheduled batch, so the patched
    // value reaches this render a tick after the write.
    await waitFor(() => expect(result.current.customers[0].sms_opt_out).toBe(true));
    expect(mockListCustomers).toHaveBeenCalledTimes(1);
  });

  it("refetchIfStale re-reads only once the data is older than the stale window", async () => {
    const { result } = renderHook(
      () => useCustomersDirectory("t1", { withCampaigns: false, staleMs: 10_000 }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.refetchIfStale(Date.now());
    });
    expect(mockListCustomers).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetchIfStale(Date.now() + 10_001);
    });
    await waitFor(() => expect(mockListCustomers).toHaveBeenCalledTimes(2));
  });

  it("surfaces a failed read as a message rather than an empty list", async () => {
    mockListCustomers.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(
      () => useCustomersDirectory("t1", { withCampaigns: false }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).not.toBeNull();
  });
});
