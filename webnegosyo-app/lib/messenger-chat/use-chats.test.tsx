/**
 * The queue's chat reads keep their last answer while a new one loads.
 *
 * Review 2026-11-15: every status change re-keyed the confirmation read, the
 * answer went `undefined`, and every chat chip (and its avatar) on the queue
 * flashed away until the read came back.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createAppQueryClient } from "../query/query-client";
import { useAuthStore } from "../../stores/auth-store";
import { useChatOrderRecords, useOrderChats } from "./use-chats";

jest.mock("./client", () => ({ platformChatDb: {} }));
jest.mock("./staff-chat-service", () => ({ fetchStaffChatTools: jest.fn() }));

const mockFetchChatOrders = jest.fn();
const mockFetchSessionsByPsid = jest.fn();
jest.mock("./repo", () => ({
  fetchChatOrders: (...args: unknown[]) => mockFetchChatOrders(...args),
  fetchSessionsByPsid: (...args: unknown[]) => mockFetchSessionsByPsid(...args),
  fetchChats: jest.fn(),
  fetchChatThread: jest.fn(),
}));

const A = "0b0c9d3c-1111-4000-8000-00000000000a";
const B = "0b0c9d3c-1111-4000-8000-00000000000b";
const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";
const chatOrder = (id: string, status: string) => ({ _id: id, status, customerData: { messenger_session_id: SESSION } });
const record = (orderId: string) => ({ orderId, state: "waiting", outcome: "sent", summarySentAt: 1, createdAt: 1 });

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createAppQueryClient();
  useAuthStore.setState({
    tenantId: "t1", orderBackend: "platform", role: "admin", isOwner: true, permissions: null, isDemo: false,
  });
  mockFetchChatOrders.mockReset();
  mockFetchSessionsByPsid.mockReset();
});
afterEach(() => client.clear());

describe("useChatOrderRecords", () => {
  it("keeps the last answer on screen while a status change is re-read, and says which orders it covers", async () => {
    mockFetchChatOrders.mockResolvedValueOnce({ ok: true, value: new Map([[A, record(A)]]) });
    const { result, rerender } = renderHook(
      ({ orders }: { orders: ReturnType<typeof chatOrder>[] }) => useChatOrderRecords(orders),
      { wrapper, initialProps: { orders: [chatOrder(A, "pending")] } },
    );
    await waitFor(() => expect(result.current.byOrderId.get(A)).toBeTruthy());
    expect([...result.current.knownOrderIds]).toEqual([A]);

    let release: (value: unknown) => void = () => undefined;
    mockFetchChatOrders.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    rerender({ orders: [chatOrder(A, "confirmed"), chatOrder(B, "pending")] });

    // Still the old answer: A keeps its chip, B is "not known yet" (not "not sent").
    expect(result.current.byOrderId.get(A)).toBeTruthy();
    expect(result.current.knownOrderIds.has(B)).toBe(false);

    await act(async () => release({ ok: true, value: new Map([[A, record(A)], [B, record(B)]]) }));
    await waitFor(() => expect(result.current.knownOrderIds.has(B)).toBe(true));
    // One read per set of orders, asked with the ids sorted.
    expect(mockFetchChatOrders).toHaveBeenLastCalledWith({}, [A, B]);
  });

  it("asks nothing for a queue without chat orders", () => {
    renderHook(() => useChatOrderRecords([{ _id: A, status: "pending", customerData: null }]), { wrapper });
    expect(mockFetchChatOrders).not.toHaveBeenCalled();
  });
});

describe("useOrderChats", () => {
  it("keeps the customers it found while a longer queue is looked up", async () => {
    const ana = { id: SESSION, psid: "111" };
    mockFetchSessionsByPsid.mockResolvedValueOnce({ ok: true, value: new Map([["111", ana]]) });
    const withPsid = (id: string, psid: string) => ({ _id: id, customerData: { messenger_psid: psid } });
    const { result, rerender } = renderHook(
      ({ orders }: { orders: ReturnType<typeof withPsid>[] }) => useOrderChats(orders),
      { wrapper, initialProps: { orders: [withPsid(A, "111")] } },
    );
    await waitFor(() => expect(result.current.byOrderId.get(A)).toBe(ana));

    mockFetchSessionsByPsid.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ orders: [withPsid(A, "111"), withPsid(B, "222")] });
    expect(result.current.byOrderId.get(A)).toBe(ana);
  });
});
