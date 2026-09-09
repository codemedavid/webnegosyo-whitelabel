/**
 * One Supabase Realtime channel per tenant, shared by every subscriber.
 *
 * Every platform hook instance used to open its own `postgres_changes` channel
 * against the same `orders` rows — seven on the Dashboard alone. The hub
 * ref-counts subscribers per tenant so the socket carries ONE channel, and
 * closes it only when the last subscriber leaves. Payloads fan out to change
 * listeners with their tenant; deciding which cached queries they touch is
 * `query-invalidation.ts`'s job, per key, so a store-wide watcher and a
 * branch-scoped board can share the channel correctly.
 *
 * No React in here. The singleton bound to the real client lives in
 * `realtime-hub-singleton.ts`; this factory takes a client slice so tests use a
 * recording fake.
 */

import {
  buildOrderSubscription,
  resolveRealtimeStatus,
  type OrderChangePayload,
  type RealtimeStatus,
} from "./supabase-realtime";

export interface RealtimeChannelLike {
  on: (
    event: string,
    binding: unknown,
    callback: (payload: OrderChangePayload) => void
  ) => RealtimeChannelLike;
  subscribe: (callback: (status: string) => void) => RealtimeChannelLike;
}

/** The slice of a supabase-js client the hub drives. */
export interface RealtimeClientLike {
  channel: (name: string) => RealtimeChannelLike;
  removeChannel: (channel: RealtimeChannelLike) => unknown;
}

export interface OrderChangeEvent {
  tenantId: string;
  payload: OrderChangePayload;
}

export type OrderChangeListener = (event: OrderChangeEvent) => void;

export interface RealtimeHubOptions {
  /** Batch payloads arriving within this window; 0 forwards synchronously. */
  coalesceMs?: number;
}

export interface RealtimeHub {
  /** Hold the tenant's channel open; returns the release for this handle. */
  acquire: (tenantId: string) => () => void;
  getStatus: (tenantId: string) => RealtimeStatus;
  /** `useSyncExternalStore` shape: fires on any tenant's status change. */
  subscribeStatus: (listener: () => void) => () => void;
  onChange: (listener: OrderChangeListener) => () => void;
  /** Close every channel; releases handed out before this become no-ops. */
  teardownAll: () => void;
}

interface TenantChannel {
  channel: RealtimeChannelLike;
  subscribers: number;
  status: RealtimeStatus;
}

export function createRealtimeHub(
  client: RealtimeClientLike,
  options: RealtimeHubOptions = {}
): RealtimeHub {
  const coalesceMs = options.coalesceMs ?? 0;
  const channels = new Map<string, TenantChannel>();
  const statusListeners = new Set<() => void>();
  const changeListeners = new Set<OrderChangeListener>();

  const notifyStatus = () => statusListeners.forEach((listener) => listener());
  const emit = (event: OrderChangeEvent) => changeListeners.forEach((listener) => listener(event));

  let pending: OrderChangeEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const enqueue = (event: OrderChangeEvent) => {
    if (coalesceMs <= 0) {
      emit(event);
      return;
    }
    pending = [...pending, event];
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = pending;
      pending = [];
      batch.forEach(emit);
    }, coalesceMs);
  };

  const open = (tenantId: string): TenantChannel => {
    const { channelName, binding } = buildOrderSubscription(tenantId);
    const entry: TenantChannel = {
      channel: client.channel(channelName),
      subscribers: 0,
      status: "disconnected",
    };
    entry.channel
      .on("postgres_changes", binding, (payload) => enqueue({ tenantId, payload }))
      .subscribe((status) => {
        // Only react while this entry is still the live one for its tenant; a
        // late status from a torn-down channel must not flip a fresh one.
        if (channels.get(tenantId) !== entry) return;
        const next = resolveRealtimeStatus(status);
        if (next === entry.status) return;
        entry.status = next;
        notifyStatus();
      });
    channels.set(tenantId, entry);
    return entry;
  };

  const close = (tenantId: string, entry: TenantChannel) => {
    channels.delete(tenantId);
    void client.removeChannel(entry.channel);
    if (entry.status === "connected") notifyStatus();
  };

  const acquire = (tenantId: string) => {
    const entry = channels.get(tenantId) ?? open(tenantId);
    entry.subscribers += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // Stale after a teardown: a new subscriber may have opened a new entry.
      if (channels.get(tenantId) !== entry) return;
      entry.subscribers -= 1;
      if (entry.subscribers <= 0) close(tenantId, entry);
    };
  };

  return {
    acquire,
    getStatus: (tenantId) => channels.get(tenantId)?.status ?? "disconnected",
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    onChange: (listener) => {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    teardownAll: () => {
      channels.forEach((entry, tenantId) => close(tenantId, entry));
    },
  };
}
