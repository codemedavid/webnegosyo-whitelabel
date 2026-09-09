/**
 * One realtime channel per tenant, shared by every subscriber.
 *
 * Before the hub, every platform hook instance opened its own channel against
 * the same `orders` rows — seven on the Dashboard alone. The hub ref-counts
 * subscribers so the socket carries one channel per tenant and closes it only
 * when the last subscriber leaves.
 */
import { createRealtimeHub, type RealtimeClientLike } from "./realtime-hub";
import type { OrderChangePayload } from "./supabase-realtime";

interface FakeChannel {
  name: string;
  onCallback: ((payload: OrderChangePayload) => void) | null;
  statusCallback: ((status: string) => void) | null;
}

function fakeClient() {
  const channels: FakeChannel[] = [];
  const removeChannel = jest.fn();
  const client: RealtimeClientLike = {
    channel: (name: string) => {
      const record: FakeChannel = { name, onCallback: null, statusCallback: null };
      channels.push(record);
      const channel = {
        on: (_event: string, _binding: unknown, cb: (payload: OrderChangePayload) => void) => {
          record.onCallback = cb;
          return channel;
        },
        subscribe: (cb: (status: string) => void) => {
          record.statusCallback = cb;
          return channel;
        },
      };
      return channel;
    },
    removeChannel,
  };
  return { client, channels, removeChannel };
}

const payloadFor = (tenantId: string): OrderChangePayload => ({
  new: { tenant_id: tenantId },
});

describe("realtime hub", () => {
  it("opens one channel per tenant however many subscribers acquire it", () => {
    const { client, channels } = fakeClient();
    const hub = createRealtimeHub(client);

    hub.acquire("t1");
    hub.acquire("t1");

    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("platform-orders:t1:default");
  });

  it("opens a separate channel for a second tenant", () => {
    const { client, channels } = fakeClient();
    const hub = createRealtimeHub(client);

    hub.acquire("t1");
    hub.acquire("t2");

    expect(channels.map((c) => c.name)).toEqual([
      "platform-orders:t1:default",
      "platform-orders:t2:default",
    ]);
  });

  it("removes the channel exactly once when the last subscriber releases", () => {
    const { client, removeChannel } = fakeClient();
    const hub = createRealtimeHub(client);

    const releaseA = hub.acquire("t1");
    const releaseB = hub.acquire("t1");

    releaseA();
    expect(removeChannel).not.toHaveBeenCalled();

    releaseB();
    expect(removeChannel).toHaveBeenCalledTimes(1);

    // A second release of the same handle must not double-decrement.
    releaseB();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("reports connected only after SUBSCRIBED and notifies status listeners", () => {
    const { client, channels } = fakeClient();
    const hub = createRealtimeHub(client);
    const listener = jest.fn();
    hub.subscribeStatus(listener);

    hub.acquire("t1");
    expect(hub.getStatus("t1")).toBe("disconnected");

    channels[0].statusCallback?.("SUBSCRIBED");
    expect(hub.getStatus("t1")).toBe("connected");
    expect(listener).toHaveBeenCalledTimes(1);

    channels[0].statusCallback?.("CHANNEL_ERROR");
    expect(hub.getStatus("t1")).toBe("disconnected");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("reports disconnected for a tenant nobody has acquired", () => {
    const hub = createRealtimeHub(fakeClient().client);
    expect(hub.getStatus("nobody")).toBe("disconnected");
  });

  it("falls back to disconnected once the channel is released", () => {
    const { client, channels } = fakeClient();
    const hub = createRealtimeHub(client);
    const release = hub.acquire("t1");
    channels[0].statusCallback?.("SUBSCRIBED");

    release();

    expect(hub.getStatus("t1")).toBe("disconnected");
  });

  it("forwards a payload to change listeners with its tenant, synchronously by default", () => {
    const { client, channels } = fakeClient();
    const hub = createRealtimeHub(client);
    const onChange = jest.fn();
    hub.onChange(onChange);
    hub.acquire("t1");

    channels[0].onCallback?.(payloadFor("t1"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ tenantId: "t1", payload: payloadFor("t1") });
  });

  it("stops forwarding to a listener that unsubscribed", () => {
    const { client, channels } = fakeClient();
    const hub = createRealtimeHub(client);
    const onChange = jest.fn();
    const off = hub.onChange(onChange);
    hub.acquire("t1");

    off();
    channels[0].onCallback?.(payloadFor("t1"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("coalesces a burst into one flush when asked to", () => {
    jest.useFakeTimers();
    try {
      const { client, channels } = fakeClient();
      const hub = createRealtimeHub(client, { coalesceMs: 50 });
      const onChange = jest.fn();
      hub.onChange(onChange);
      hub.acquire("t1");

      channels[0].onCallback?.(payloadFor("t1"));
      channels[0].onCallback?.(payloadFor("t1"));
      expect(onChange).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(onChange).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("teardownAll removes every channel and makes stale releases no-ops", () => {
    const { client, removeChannel } = fakeClient();
    const hub = createRealtimeHub(client);
    const release = hub.acquire("t1");
    hub.acquire("t2");

    hub.teardownAll();
    expect(removeChannel).toHaveBeenCalledTimes(2);
    expect(hub.getStatus("t1")).toBe("disconnected");

    // A subscriber that acquired before the teardown must not tear down a
    // channel a NEW subscriber opened after it.
    hub.acquire("t1");
    release();
    expect(removeChannel).toHaveBeenCalledTimes(2);
  });
});
