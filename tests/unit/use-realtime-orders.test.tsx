import { renderHook, act } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { createClient } from "@/lib/supabase/client";

/**
 * P5 — the admin order queue must stream from whichever project actually holds
 * the tenant's orders. Before this, the hook was hard-wired to the platform
 * browser client, so a tenant on their own Supabase project would sit on a
 * silently empty "Live updates" indicator forever.
 */

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

type ChangeHandler = (payload: { new: Record<string, unknown> }) => void;

function makeFakeClient() {
  const handlers = new Map<string, ChangeHandler>();
  const filters: Array<Record<string, unknown>> = [];
  let subscribeCallback: ((status: string) => void) | undefined;
  const removeChannel = jest.fn();
  const channelNames: string[] = [];

  const channel = {
    on(
      _type: string,
      config: Record<string, unknown>,
      handler: ChangeHandler
    ) {
      filters.push(config);
      handlers.set(config.event as string, handler);
      return channel;
    },
    subscribe(callback: (status: string) => void) {
      subscribeCallback = callback;
      return channel;
    },
  };

  const client = {
    channel(name: string) {
      channelNames.push(name);
      return channel;
    },
    removeChannel,
  } as unknown as SupabaseClient;

  return {
    client,
    channelNames,
    filters,
    removeChannel,
    emit(event: string, row: Record<string, unknown>) {
      handlers.get(event)?.({ new: row });
    },
    setStatus(status: string) {
      subscribeCallback?.(status);
    },
  };
}

describe("useRealtimeOrders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("subscribes on the platform client when no tenant client is supplied", () => {
    const platform = makeFakeClient();
    mockedCreateClient.mockReturnValue(platform.client as never);

    renderHook(() => useRealtimeOrders({ tenantId: "tenant-1" }));

    expect(mockedCreateClient).toHaveBeenCalled();
    expect(platform.channelNames).toEqual(["admin-orders:tenant-1"]);
  });

  it("subscribes on the tenant's own project client when one is supplied", () => {
    const platform = makeFakeClient();
    const tenant = makeFakeClient();
    mockedCreateClient.mockReturnValue(platform.client as never);

    renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client: tenant.client })
    );

    expect(tenant.channelNames).toEqual(["admin-orders:tenant-1"]);
    expect(platform.channelNames).toEqual([]);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("scopes both INSERT and UPDATE subscriptions to the tenant", () => {
    const tenant = makeFakeClient();

    renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client: tenant.client })
    );

    expect(tenant.filters).toHaveLength(2);
    tenant.filters.forEach((filter) => {
      expect(filter.table).toBe("orders");
      expect(filter.filter).toBe("tenant_id=eq.tenant-1");
    });
  });

  it("reports a new order to the caller", () => {
    const tenant = makeFakeClient();
    const onNewOrder = jest.fn();

    renderHook(() =>
      useRealtimeOrders({
        tenantId: "tenant-1",
        client: tenant.client,
        onNewOrder,
      })
    );

    act(() => tenant.emit("INSERT", { id: "order-1", total: 250 }));

    expect(onNewOrder).toHaveBeenCalledWith({ id: "order-1", total: 250 });
  });

  it("reports an order status change to the caller", () => {
    const tenant = makeFakeClient();
    const onOrderUpdate = jest.fn();

    renderHook(() =>
      useRealtimeOrders({
        tenantId: "tenant-1",
        client: tenant.client,
        onOrderUpdate,
      })
    );

    act(() => tenant.emit("UPDATE", { id: "order-1", status: "ready" }));

    expect(onOrderUpdate).toHaveBeenCalledWith({ id: "order-1", status: "ready" });
  });

  it("turns the live indicator on only once the channel is subscribed", () => {
    const tenant = makeFakeClient();

    const { result } = renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client: tenant.client })
    );

    expect(result.current.isConnected).toBe(false);

    act(() => tenant.setStatus("SUBSCRIBED"));
    expect(result.current.isConnected).toBe(true);

    act(() => tenant.setStatus("CLOSED"));
    expect(result.current.isConnected).toBe(false);
  });

  it("removes the channel from the same client it subscribed on", () => {
    const platform = makeFakeClient();
    const tenant = makeFakeClient();
    mockedCreateClient.mockReturnValue(platform.client as never);

    const { unmount } = renderHook(() =>
      useRealtimeOrders({ tenantId: "tenant-1", client: tenant.client })
    );

    unmount();

    expect(tenant.removeChannel).toHaveBeenCalledTimes(1);
    expect(platform.removeChannel).not.toHaveBeenCalled();
  });

  it("does not subscribe when disabled", () => {
    const tenant = makeFakeClient();

    renderHook(() =>
      useRealtimeOrders({
        tenantId: "tenant-1",
        client: tenant.client,
        enabled: false,
      })
    );

    expect(tenant.channelNames).toEqual([]);
  });

  it("does not subscribe without a tenant id", () => {
    const tenant = makeFakeClient();

    renderHook(() => useRealtimeOrders({ tenantId: "", client: tenant.client }));

    expect(tenant.channelNames).toEqual([]);
  });
});
