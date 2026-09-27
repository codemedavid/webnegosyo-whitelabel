import { renderHook, act } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { createClient } from "@/lib/supabase/client";
import type { BranchScope } from "@/lib/outlets/branch-scope";

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

  it("uses current callbacks without reconnecting the live order stream", () => {
    const tenant = makeFakeClient();
    const original = { onNewOrder: jest.fn(), onOrderUpdate: jest.fn() };
    const current = { onNewOrder: jest.fn(), onOrderUpdate: jest.fn() };
    const { rerender, result } = renderHook(
      (callbacks) => useRealtimeOrders({ tenantId: "tenant-1", client: tenant.client, ...callbacks }),
      { initialProps: original }
    );
    act(() => tenant.setStatus("SUBSCRIBED"));

    rerender(current);
    act(() => {
      tenant.emit("INSERT", { id: "order-1" });
      tenant.emit("UPDATE", { id: "order-1", status: "ready" });
    });

    expect(current.onNewOrder).toHaveBeenCalledWith({ id: "order-1" });
    expect(current.onOrderUpdate).toHaveBeenCalledWith({ id: "order-1", status: "ready" });
    expect(original.onNewOrder).not.toHaveBeenCalled();
    expect(original.onOrderUpdate).not.toHaveBeenCalled();
    expect(tenant.channelNames).toEqual(["admin-orders:tenant-1"]);
    expect(tenant.removeChannel).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(true);
  });

  it("applies a changed branch scope without reconnecting", () => {
    const tenant = makeFakeClient();
    const onNewOrder = jest.fn();
    const onOrderUpdate = jest.fn();
    const { rerender } = renderHook(
      ({ scope }: { scope: BranchScope }) => useRealtimeOrders({
        tenantId: "tenant-1", client: tenant.client, scope, onNewOrder, onOrderUpdate,
      }),
      { initialProps: { scope: { kind: "all" } } }
    );

    rerender({ scope: { kind: "branch", outletId: "north" } });
    act(() => {
      tenant.emit("INSERT", { id: "south-order", outlet_id: "south" });
      tenant.emit("UPDATE", { id: "south-order", outlet_id: "south" });
      tenant.emit("INSERT", { id: "north-order", outlet_id: "north" });
      tenant.emit("UPDATE", { id: "north-order", outlet_id: "north" });
    });

    expect(onNewOrder).toHaveBeenCalledTimes(1);
    expect(onNewOrder).toHaveBeenCalledWith({ id: "north-order", outlet_id: "north" });
    expect(onOrderUpdate).toHaveBeenCalledTimes(1);
    expect(onOrderUpdate).toHaveBeenCalledWith({ id: "north-order", outlet_id: "north" });
    expect(tenant.channelNames).toEqual(["admin-orders:tenant-1"]);
    expect(tenant.removeChannel).not.toHaveBeenCalled();
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

  it("ignores late events from the previous project after switching clients", () => {
    const previous = makeFakeClient();
    const current = makeFakeClient();
    const onNewOrder = jest.fn();
    const onOrderUpdate = jest.fn();
    const { result, rerender } = renderHook(
      ({ client, tenantId }) => useRealtimeOrders({ client, tenantId, onNewOrder, onOrderUpdate }),
      { initialProps: { client: previous.client, tenantId: "tenant-1" } }
    );
    act(() => previous.setStatus("SUBSCRIBED"));

    rerender({ client: current.client, tenantId: "tenant-2" });
    expect(previous.removeChannel).toHaveBeenCalledTimes(1);
    expect(current.channelNames).toEqual(["admin-orders:tenant-2"]);
    expect(result.current.isConnected).toBe(false);

    act(() => {
      previous.emit("INSERT", { id: "old-order" });
      previous.emit("UPDATE", { id: "old-order" });
      previous.setStatus("SUBSCRIBED");
    });
    expect(onNewOrder).not.toHaveBeenCalled();
    expect(onOrderUpdate).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);

    act(() => {
      current.setStatus("SUBSCRIBED");
      previous.setStatus("CLOSED");
      current.emit("INSERT", { id: "current-order" });
    });
    expect(result.current.isConnected).toBe(true);
    expect(onNewOrder).toHaveBeenCalledWith({ id: "current-order" });
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

  it.each(["disabled", "unmounted"])("ignores late order events when %s", (stop) => {
    const tenant = makeFakeClient();
    const onNewOrder = jest.fn();
    const onOrderUpdate = jest.fn();
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useRealtimeOrders({
        tenantId: "tenant-1", client: tenant.client, enabled, onNewOrder, onOrderUpdate,
      }),
      { initialProps: { enabled: true } }
    );
    act(() => tenant.setStatus("SUBSCRIBED"));

    if (stop === "disabled") rerender({ enabled: false });
    else unmount();
    act(() => {
      tenant.emit("INSERT", { id: "late-order" });
      tenant.emit("UPDATE", { id: "late-order" });
      tenant.setStatus("SUBSCRIBED");
    });

    expect(tenant.removeChannel).toHaveBeenCalledTimes(1);
    expect(onNewOrder).not.toHaveBeenCalled();
    expect(onOrderUpdate).not.toHaveBeenCalled();
    if (stop === "disabled") expect(result.current.isConnected).toBe(false);
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
