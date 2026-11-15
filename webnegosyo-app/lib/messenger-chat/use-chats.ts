/**
 * Messenger chats on the shared cache: the queue's chips, one thread, the list.
 *
 * Gated before any request on what the database would refuse anyway — a
 * platform store and an account that can read orders — so a cashier without
 * an order key sees a plain queue, not a failing one. Convex stores keep no
 * chat log, so they never ask.
 */

import { useCallback, useMemo } from "react";
import { resourceKey } from "../backends/query-keys";
import { useAuthStore } from "../../stores/auth-store";
import { canReadOrders, hasPermission } from "../staff-permissions";
import { useResource } from "../query/use-resource";
import { useResourceKeepPrevious } from "../query/use-resource-keep-previous";
import { chatSessionIdOf, type ChatOrderRecord } from "./chat-order";
import {
  CHAT_ORDERS_RESOURCE,
  CHAT_THREAD_RESOURCE,
  CHATS_RESOURCE,
  messengerPsidOf,
  ORDER_CHATS_RESOURCE,
  type ChatSession,
} from "./chat";
import { platformChatDb } from "./client";
import type { StaffChatTools } from "./staff-chat";
import { fetchStaffChatTools } from "./staff-chat-service";
import {
  fetchChatOrders,
  fetchChats,
  fetchChatThread,
  fetchSessionsByPsid,
  type ChatListEntry,
  type ChatThread,
} from "./repo";
import {
  CHAT_ORDER_WAITING_POLL_MS,
  CHAT_QUEUE_STALE_MS,
  CHAT_THREAD_REFRESH_MS,
  CHAT_THREAD_STALE_MS,
  CHAT_TOOLS_POLL_MS,
} from "./timing";

/** The newest orders a queue looks up; a long date range badges its first page. */
const MAX_TRACKED_ORDERS = 200;

const NO_CHATS: ReadonlyMap<string, ChatSession> = new Map();

/** Whether this account, on this store, has chats to read at all. */
export function useCanReadChats(): { canRead: boolean; tenantId: string | null } {
  const tenantId = useAuthStore((s) => s.tenantId);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const canRead =
    !!tenantId && !isDemo && orderBackend === "platform" && canReadOrders({ role, isOwner, permissions });
  return { canRead, tenantId };
}

/**
 * Whether this account may ring up an order for a chat: it can read chats,
 * may use the register, and is not tied to one branch (a chat belongs to the
 * store, so a branch account would be picking the branch for it).
 */
export function useCanMakeChatOrders(): boolean {
  const { canRead } = useCanReadChats();
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const outletId = useAuthStore((s) => s.outletId);
  return canRead && outletId === null && hasPermission({ role, isOwner, permissions }, "pos");
}

export interface OrderChatSource {
  _id: string;
  customerData?: Record<string, unknown> | null;
}

export interface OrderChatsView {
  /** The chat behind each Messenger order on screen. */
  byOrderId: ReadonlyMap<string, ChatSession>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** What an id-list read answers, with the ids it was asked about. */
interface IdsAnswer<T> {
  ids: ReadonlySet<string>;
  value: T;
}

interface IdsResourceInput<T> {
  name: string;
  tenantId: string | null;
  isEnabled: boolean;
  ids: readonly string[];
  /** More of the key than the ids (the statuses), when a change of it must re-read at once. */
  keyExtra?: string;
  /** Module-level, so the read stays the same function between renders. */
  read: (tenantId: string, ids: readonly string[]) => Promise<T>;
  staleTime: number;
  refetchInterval?: number | false;
}

/**
 * One read for a list of ids (customers, orders) on the shared cache. The key
 * holds the sorted ids, so the same set is one read however it is ordered,
 * and the previous answer is kept while a new set loads.
 */
function useIdsResource<T>({ name, tenantId, isEnabled, ids, keyExtra, read, staleTime, refetchInterval }: IdsResourceInput<T>) {
  const idsKey = useMemo(() => [...new Set(ids)].sort().join(","), [ids]);
  const sortedIds = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);
  const fetcher = useCallback(async (): Promise<IdsAnswer<T>> => {
    const value = await read(tenantId as string, sortedIds);
    return { ids: new Set(sortedIds), value };
  }, [read, tenantId, sortedIds]);
  return useResourceKeepPrevious(
    isEnabled && sortedIds.length > 0 ? resourceKey(name, tenantId, keyExtra ?? idsKey) : null,
    fetcher,
    { staleTime, refetchInterval },
  );
}

async function readSessionsByPsid(tenantId: string, psids: readonly string[]): Promise<Map<string, ChatSession>> {
  const result = await fetchSessionsByPsid(platformChatDb, tenantId, psids);
  if (!result.ok) throw new Error("The Messenger chat could not be loaded.");
  return result.value;
}

async function readChatOrders(_tenantId: string, orderIds: readonly string[]): Promise<Map<string, ChatOrderRecord>> {
  const result = await fetchChatOrders(platformChatDb, orderIds);
  if (!result.ok) throw new Error("The order's Messenger status could not be loaded.");
  return result.value;
}

/** The Messenger customer behind each order on screen (one read per 100 customers). */
export function useOrderChats(orders: readonly OrderChatSource[] | null | undefined): OrderChatsView {
  const { canRead, tenantId } = useCanReadChats();

  const psidByOrder = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    for (const order of (orders ?? []).slice(0, MAX_TRACKED_ORDERS)) {
      const psid = messengerPsidOf(order.customerData);
      if (psid) pairs.push([order._id, psid]);
    }
    return pairs;
  }, [orders]);

  const psids = useMemo(() => [...new Set(psidByOrder.map(([, psid]) => psid))], [psidByOrder]);
  const resource = useIdsResource({
    name: ORDER_CHATS_RESOURCE,
    tenantId,
    isEnabled: canRead,
    ids: psids,
    read: readSessionsByPsid,
    staleTime: CHAT_QUEUE_STALE_MS,
  });

  const byPsid = resource.data?.value ?? NO_CHATS;
  const byOrderId = useMemo(() => {
    if (byPsid.size === 0) return NO_CHATS;
    const map = new Map<string, ChatSession>();
    for (const [orderId, psid] of psidByOrder) {
      const session = byPsid.get(psid);
      if (session) map.set(orderId, session);
    }
    return map;
  }, [byPsid, psidByOrder]);

  return { byOrderId, isLoading: resource.isLoading, error: resource.error, refetch: resource.refetch };
}

export interface ChatOrderSource extends OrderChatSource {
  status: string;
}

export interface ChatOrderRecordsView {
  /** What the server recorded for each order staff rang up for a chat. */
  byOrderId: ReadonlyMap<string, ChatOrderRecord>;
  /**
   * The orders the last read asked about. Only for these is a missing row
   * "not sent"; any other order is "not known yet". While a new set of orders
   * loads, the previous answer stays on screen (no chip flashes away on every
   * status change), and an order it did not cover stays "not known".
   */
  knownOrderIds: ReadonlySet<string>;
  refetch: () => Promise<void>;
}

const NO_RECORDS: ReadonlyMap<string, ChatOrderRecord> = new Map();
const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Where the orders rung up for a chat stand. Asks only for orders that name a
 * chat (most queues ask nothing), and keeps looking only while one of them is
 * still waiting: a customer tapping "Change something" moves no order status,
 * so nothing else would bring it to the screen.
 */
export function useChatOrderRecords(orders: readonly ChatOrderSource[] | null | undefined): ChatOrderRecordsView {
  const { canRead, tenantId } = useCanReadChats();

  const tracked = useMemo(
    () => (orders ?? []).slice(0, MAX_TRACKED_ORDERS).filter((order) => chatSessionIdOf(order.customerData) !== null),
    [orders],
  );
  const ids = useMemo(() => tracked.map((order) => order._id), [tracked]);
  // The statuses are part of the key: an order that just became confirmed is
  // re-read at once, so "Customer confirmed" does not wait for the timer.
  const statuses = useMemo(
    () => tracked.map((order) => `${order._id}:${order.status}`).sort().join(","),
    [tracked],
  );
  const isWaiting = tracked.some((order) => order.status === "pending");

  const resource = useIdsResource({
    name: CHAT_ORDERS_RESOURCE,
    tenantId,
    isEnabled: canRead,
    ids,
    keyExtra: statuses,
    read: readChatOrders,
    staleTime: CHAT_THREAD_STALE_MS,
    refetchInterval: isWaiting ? CHAT_ORDER_WAITING_POLL_MS : false,
  });

  return {
    byOrderId: resource.data?.value ?? NO_RECORDS,
    knownOrderIds: resource.data?.ids ?? NO_IDS,
    refetch: resource.refetch,
  };
}

export interface ChatThreadView {
  /** Null once loaded = no such chat for this account. */
  thread: ChatThread | null | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface ChatThreadOptions {
  /**
   * Keep reading while this is true (the chat screen in view, the register
   * pane on a register in view): a new line shows up without a pull. React
   * Query stops the timer while the app is in the background.
   */
  isLive?: boolean;
}

/** One conversation: who it is and the newest lines. */
export function useChatThread(sessionId: string | null | undefined, options: ChatThreadOptions = {}): ChatThreadView {
  const { canRead, tenantId } = useCanReadChats();
  const isEnabled = canRead && !!sessionId;

  const fetcher = useCallback(async () => {
    const result = await fetchChatThread(platformChatDb, sessionId as string);
    if (!result.ok) throw new Error("The chat could not be loaded.");
    return result.value;
  }, [sessionId]);

  const resource = useResource(
    isEnabled ? resourceKey(CHAT_THREAD_RESOURCE, tenantId, sessionId) : null,
    fetcher,
    { staleTime: CHAT_THREAD_STALE_MS, refetchInterval: options.isLive ? CHAT_THREAD_REFRESH_MS : false },
  );

  return {
    thread: resource.data,
    isLoading: resource.isLoading,
    isRefetching: resource.isRefetching,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export interface ChatsView {
  chats: readonly ChatListEntry[];
  hasMore: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const NO_ENTRIES: readonly ChatListEntry[] = [];

/** The store's newest conversations (first page; the list screen pages the rest itself). */
export function useChats(isActive = true): ChatsView {
  const { canRead, tenantId } = useCanReadChats();
  const isEnabled = canRead && isActive;

  const fetcher = useCallback(async () => {
    const result = await fetchChats(platformChatDb, tenantId as string);
    if (!result.ok) throw new Error("Chats could not be loaded.");
    return result.value;
  }, [tenantId]);

  const resource = useResource(isEnabled ? resourceKey(CHATS_RESOURCE, tenantId) : null, fetcher, {
    staleTime: CHAT_THREAD_STALE_MS,
  });

  return {
    chats: resource.data?.chats ?? NO_ENTRIES,
    hasMore: resource.data?.hasMore ?? false,
    isLoading: resource.isLoading,
    isRefetching: resource.isRefetching,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export const STAFF_CHAT_TOOLS_RESOURCE = "messenger-staff-chat-tools";

export interface StaffChatToolsView {
  tools: StaffChatTools | null;
  error: string | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * What this account can send in this chat right now (`POST /api/messenger/chat`
 * `tools`). Asked only of accounts that may reply (`useCanMakeChatOrders`:
 * store-wide with `pos`, the same people as Make order).
 */
export function useStaffChatTools(sessionId: string | null | undefined, options: ChatThreadOptions = {}): StaffChatToolsView {
  const canReply = useCanMakeChatOrders();
  const tenantId = useAuthStore((s) => s.tenantId);
  const isEnabled = canReply && !!sessionId && !!tenantId;

  const fetcher = useCallback(async () => {
    const result = await fetchStaffChatTools({ tenantId: tenantId as string, sessionId: sessionId as string });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, [tenantId, sessionId]);

  const resource = useResource(
    isEnabled ? resourceKey(STAFF_CHAT_TOOLS_RESOURCE, tenantId, sessionId) : null,
    fetcher,
    // The chips follow the chat (a new cart, an order moving on) while the chat is in view.
    { staleTime: CHAT_THREAD_STALE_MS, refetchInterval: options.isLive ? CHAT_TOOLS_POLL_MS : false },
  );

  return { tools: resource.data ?? null, error: resource.error, isLoading: resource.isLoading, refetch: resource.refetch };
}
