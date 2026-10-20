import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

import { createAppQueryClient } from "../query/query-client";
import type { ApprovalsApi } from "./api";
import { approvalRequest } from "./test-fixtures";
import { useApprovalInbox, useApprovalRequest, useInvalidateApprovals } from "./use-approvals";

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function fakeApi(overrides: Partial<ApprovalsApi> = {}): ApprovalsApi {
  const unused = jest.fn(async () => ({ ok: false as const, status: 500, error: "unused" }));
  return {
    list: jest.fn(async () => ({ ok: true as const, status: 200, data: { requests: [approvalRequest()], isApprover: true } })),
    get: jest.fn(async () => ({ ok: true as const, status: 200, data: { request: approvalRequest() } })),
    create: unused,
    decide: unused,
    withdraw: unused,
    getRules: unused,
    saveRules: unused,
    ...overrides,
  };
}

beforeEach(() => {
  client = createAppQueryClient();
});

afterEach(() => {
  client.clear();
});

describe("approvals hooks", () => {
  it("reads the inbox for the tenant", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useApprovalInbox("t-1", true, api), { wrapper });
    await waitFor(() => expect(result.current.data?.requests).toHaveLength(1));
    expect(api.list).toHaveBeenCalledWith("t-1", "pending");
  });

  it("does not read at all when disabled", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useApprovalInbox("t-1", false, api), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(api.list).not.toHaveBeenCalled();
  });

  it("surfaces the server's refusal in its own words", async () => {
    const api = fakeApi({
      get: jest.fn(async () => ({ ok: false as const, status: 404, error: "This request could not be found.", code: "not_found" })),
    });
    const { result } = renderHook(() => useApprovalRequest("t-1", "req-9", api), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toEqual({ message: "This request could not be found.", status: 404, code: "not_found" });
  });

  it("one invalidation refreshes every approvals read for the tenant", async () => {
    const api = fakeApi();
    const { result } = renderHook(
      () => ({ one: useApprovalRequest("t-1", "req-1", api), invalidate: useInvalidateApprovals("t-1") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.one.data?.id).toBe("req-1"));
    await act(async () => {
      await result.current.invalidate();
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
