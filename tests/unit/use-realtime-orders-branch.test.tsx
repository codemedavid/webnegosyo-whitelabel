import { renderHook, act } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { createClient } from "@/lib/supabase/client";

/**
 * Branch scoping on the live order stream.
 *
 * This one is not just a display concern. The wrapper above this hook plays a
 * chime and raises a browser notification with `requireInteraction: true` on
 * every new order. Unscoped, a branch account is interrupted — repeatedly, and
 * with a notification that will not dismiss itself — by orders taken at a
 * branch it cannot even open.
 *
 * The Postgres `filter` string can only carry one equality, already spent on
 * `tenant_id`, so the branch check happens in the handler.
 */

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

type ChangeHandler = (payload: { new: Record<string, unknown> }) => void;

function makeFakeClient() {
  const handlers = new Map<string, ChangeHandler>();

  const channel = {
    on(_type: string, config: Record<string, unknown>, handler: ChangeHandler) {
      handlers.set(config.event as string, handler);
      return channel;
    },
    subscribe() {
      return channel;
    },
  };

  const client = {
    channel: () => channel,
    removeChannel: jest.fn(),
  } as unknown as SupabaseClient;

  return { client, handlers };
}

const NORTH = { kind: "branch", outletId: "outlet-north" } as const;
const ALL = { kind: "all" } as const;

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    tenant_id: "tenant-1",
    total: 100,
    status: "pending",
    created_at: "2026-07-29T10:00:00Z",
    outlet_id: "outlet-north",
    ...overrides,
  };
}

describe("useRealtimeOrders branch scoping", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("announces an order taken at this branch", () => {
    const { client, handlers } = makeFakeClient();
    const onNewOrder = jest.fn();

    renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client, onNewOrder, scope: NORTH })
    );
    act(() => {
      handlers.get("INSERT")?.({ new: orderRow() });
    });

    expect(onNewOrder).toHaveBeenCalledTimes(1);
  });

  it("stays silent for an order taken at another branch", () => {
    const { client, handlers } = makeFakeClient();
    const onNewOrder = jest.fn();

    renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client, onNewOrder, scope: NORTH })
    );
    act(() => {
      handlers.get("INSERT")?.({ new: orderRow({ outlet_id: "outlet-south" }) });
    });

    expect(onNewOrder).not.toHaveBeenCalled();
  });

  it("stays silent for an unattributed order", () => {
    const { client, handlers } = makeFakeClient();
    const onNewOrder = jest.fn();

    renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client, onNewOrder, scope: NORTH })
    );
    act(() => {
      handlers.get("INSERT")?.({ new: orderRow({ outlet_id: null }) });
    });

    expect(onNewOrder).not.toHaveBeenCalled();
  });

  it("suppresses the status update for another branch too", () => {
    // Otherwise the queue mutates under a branch account for an order it was
    // never shown.
    const { client, handlers } = makeFakeClient();
    const onOrderUpdate = jest.fn();

    renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client, onOrderUpdate, scope: NORTH })
    );
    act(() => {
      handlers.get("UPDATE")?.({ new: orderRow({ outlet_id: "outlet-south" }) });
    });

    expect(onOrderUpdate).not.toHaveBeenCalled();
  });

  it("announces every branch to a store-wide account", () => {
    const { client, handlers } = makeFakeClient();
    const onNewOrder = jest.fn();

    renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client, onNewOrder, scope: ALL })
    );
    act(() => {
      handlers.get("INSERT")?.({ new: orderRow({ outlet_id: "outlet-south" }) });
    });

    expect(onNewOrder).toHaveBeenCalledTimes(1);
  });

  it("announces everything when no scope is given", () => {
    // Existing callers pass no scope and must keep behaving exactly as before.
    const { client, handlers } = makeFakeClient();
    const onNewOrder = jest.fn();

    renderHook(() => useRealtimeOrders({ tenantId: "tenant-1", client, onNewOrder }));
    act(() => {
      handlers.get("INSERT")?.({ new: orderRow({ outlet_id: null }) });
    });

    expect(onNewOrder).toHaveBeenCalledTimes(1);
  });
});
