/**
 * The order screens' offline half: what they read when the server cannot
 * answer, and how they write when it cannot hear.
 *
 * Opt-in per screen (Orders, order detail, Kitchen, register sales, Home's
 * queue) rather than inside `useSafeQuery`, because reports must keep
 * reading only what the server holds — an unsynced sale in a revenue figure
 * would be counted twice the moment it lands.
 *
 * Reads: the server's answer with queued sales added and pending changes laid
 * over it (`offline-order-view.ts`). The last live list is kept on disk, so a
 * shop that opens the app with no connection still sees its open orders.
 *
 * Writes: `useOfflineOrderMutation` has the signature of `useSafeMutation`;
 * a change that cannot reach the server is queued and resolves with a
 * marker (`isQueuedOrderWrite`) so the screen can leave its follow-ups —
 * stock on a cancel, Loyverse on a confirm — to the replay.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FunctionReference } from "convex/server";
import { useSafeMutation, type SafeQueryResult } from "../hooks";
import { useAuthStore } from "../../stores/auth-store";
import { resolveOrderBackend, type OrderBackend } from "../order-backend";
import { useAccountBranchScope } from "../use-branch-scope";
import { branchScopeKey } from "../backends/query-keys";
import { getOutbox } from "./order-outbox";
import { getOrderEdits, isOrderEditRef } from "./order-edits";
import { persistSnapshot, readResourceSnapshot } from "./resource-snapshot";
import { useConnectivity } from "./use-connectivity";
import { useOrderEdits, useOutbox } from "./use-outbox-sync";
import { writeOrderChange } from "./write-order-change";
import {
  applyOrderEdits,
  findQueuedSale,
  isSaleUnwritten,
  localOrderItems,
  localPaymentsFor,
  mergeOrderList,
  mergeRealtimeQueue,
  queuedSaleToOrder,
  type LocalOrder,
  type LocalOrderItem,
  type OfflineOrderFields,
  type OfflineOrderInput,
} from "./offline-order-view";
import type { OrderPaymentLike } from "../order-history-view";

export const ORDER_LIST_SNAPSHOT_PREFIX = "offline_orders_v1:";

/**
 * The rows the order lists last showed, by id — what the order screen falls
 * back to offline for an order it never loaded on its own. A list row has no
 * line items, but its status, total and payment are enough to run it.
 */
const lastSeenOrders = new Map<string, unknown>();
const LAST_SEEN_LIMIT = 500;

function rememberOrders(rows: readonly { _id: string }[]): void {
  for (const row of rows) {
    lastSeenOrders.delete(row._id);
    lastSeenOrders.set(row._id, row);
  }
  while (lastSeenOrders.size > LAST_SEEN_LIMIT) {
    const oldest = lastSeenOrders.keys().next().value;
    if (oldest === undefined) break;
    lastSeenOrders.delete(oldest);
  }
}

/** The last list row seen for this order, if any screen showed it. */
export function recallOrder<T>(orderId: string): T | undefined {
  return lastSeenOrders.get(orderId) as T | undefined;
}

/** The fields every order row has, whichever backend served it. */
interface OrderRowLike {
  _id: string;
  _creationTime?: number;
  status?: string;
  paymentStatus?: string | null;
  amountPaid?: number | null;
}

export interface OfflineReadState {
  /** The server could not be asked; what shows is saved and queued work. */
  isOffline: boolean;
  /** When the saved copy on screen was last read live; null when it is live. */
  savedAt: number | null;
}

function useOrderBackend(): OrderBackend {
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  return resolveOrderBackend({ order_backend: orderBackend, convex_deployment_url: convexUrl });
}

function useScopedTenantId(): string | null {
  return useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
}

/** The device's unsynced work for the store in scope. */
export function useOfflineOrderInput(
  extra: Pick<OfflineOrderInput, "window" | "status"> = {}
): OfflineOrderInput {
  const tenantId = useScopedTenantId();
  const { sales } = useOutbox();
  const { edits } = useOrderEdits();
  const { window, status } = extra;
  return useMemo(
    () => ({ sales, edits, tenantId, window, status }),
    [sales, edits, tenantId, window, status]
  );
}

/**
 * Keep the last live answer on disk under `name`, and hand it back when the
 * server cannot be asked. `name` null: a dated report, never saved.
 */
function useSavedAnswer<T>(
  name: string | null,
  result: SafeQueryResult<T>,
  isOffline: boolean
): { value: T | undefined; savedAt: number | null } {
  const tenantId = useScopedTenantId();
  const scope = useAccountBranchScope();
  const key = name && tenantId ? `${ORDER_LIST_SNAPSHOT_PREFIX}${tenantId}:${branchScopeKey(scope)}:${name}` : null;
  const [saved, setSaved] = useState<{ key: string; value: T; savedAt: number } | null>(null);

  const isLive = result.data !== undefined && !result.error && !isOffline;
  useEffect(() => {
    if (!key || !isLive) return;
    void persistSnapshot(key, result.data, Date.now());
  }, [key, isLive, result.data]);

  const needsSaved = key !== null && result.data === undefined && (isOffline || result.error !== null);
  useEffect(() => {
    if (!needsSaved || !key) return;
    let isCurrent = true;
    void readResourceSnapshot<T>(key).then((snapshot) => {
      if (isCurrent && snapshot) setSaved({ key, value: snapshot.value, savedAt: snapshot.savedAt });
    });
    return () => {
      isCurrent = false;
    };
  }, [needsSaved, key]);

  if (result.data !== undefined) return { value: result.data, savedAt: null };
  if (saved && saved.key === key) return { value: saved.value, savedAt: saved.savedAt };
  return { value: undefined, savedAt: null };
}

/**
 * Offline, an error or an endless spinner hides orders the shop can still
 * work with; online, the screen behaves exactly as before.
 */
function offlineAware<T>(
  result: SafeQueryResult<unknown>,
  data: T,
  isOffline: boolean,
  savedAt: number | null
): SafeQueryResult<T> & OfflineReadState {
  return {
    ...result,
    data,
    isLoading: isOffline ? false : result.isLoading,
    error: isOffline ? null : result.error,
    isMissingFunction: isOffline ? false : result.isMissingFunction,
    isOffline,
    savedAt,
  };
}

export interface OfflineOrderListOptions {
  /** Save the live answer under this name; null for a dated report. */
  snapshotName?: string | null;
  window?: OfflineOrderInput["window"];
  status?: string | null;
}

/** An `orders:getOrders` read with the device's unsynced orders in it. */
export function useOfflineOrderList<T extends OrderRowLike>(
  result: SafeQueryResult<T[]>,
  options: OfflineOrderListOptions = {}
): SafeQueryResult<(T | LocalOrder)[]> & OfflineReadState {
  const isOffline = useConnectivity().status === "offline";
  const input = useOfflineOrderInput({ window: options.window ?? null, status: options.status ?? null });
  const { value, savedAt } = useSavedAnswer(options.snapshotName ?? null, result, isOffline);
  const merged = useMemo(() => mergeOrderList(value, input), [value, input]);
  useEffect(() => rememberOrders(merged), [merged]);
  // No server answer yet and nothing queued: still loading, not "no orders".
  const data = value === undefined && merged.length === 0 && !isOffline ? undefined : merged;
  return offlineAware(result, data as (T | LocalOrder)[], isOffline, savedAt);
}

type QueueBuckets<T> = Record<string, T[] | undefined>;

/** An `orders:getRealtimeQueue` read with the device's unsynced orders filed in. */
export function useOfflineRealtimeQueue<T extends OrderRowLike>(
  result: SafeQueryResult<QueueBuckets<T>>,
  snapshotName: string
): SafeQueryResult<QueueBuckets<T | LocalOrder>> & OfflineReadState {
  const isOffline = useConnectivity().status === "offline";
  const input = useOfflineOrderInput();
  const { value, savedAt } = useSavedAnswer(snapshotName, result, isOffline);
  const merged = useMemo(() => mergeRealtimeQueue(value, input), [value, input]);
  useEffect(() => {
    if (merged) rememberOrders(Object.values(merged).flatMap((bucket) => bucket ?? []));
  }, [merged]);
  return offlineAware(result, merged as QueueBuckets<T | LocalOrder>, isOffline, savedAt);
}

/** `orders:getAllOrderItems` rows with the queued sales' lines added. */
export function useOfflineOrderItems<I>(items: readonly I[] | undefined): (I | (LocalOrderItem & { orderId: string }))[] | undefined {
  const input = useOfflineOrderInput();
  return useMemo(() => {
    const local = localOrderItems(input);
    if (local.length === 0) return items as I[] | undefined;
    const known = new Set((items ?? []).map((item) => (item as { orderId?: string }).orderId));
    return [...(items ?? []), ...local.filter((item) => !known.has(item.orderId))];
  }, [items, input]);
}

export interface OfflineOrderDetail {
  /** The id the server knows this order by (a written Convex sale's real id). */
  serverOrderId: string;
  /** The order exists only on this device; do not ask the server for it. */
  isDeviceOnly: boolean;
  /** The queued sale as an order, changes applied; null when none is queued. */
  localOrder: LocalOrder | null;
  /** Lay this device's pending changes over the server's order. */
  withEdits: <O extends OrderRowLike>(order: O) => O & OfflineOrderFields;
  /** Payments collected offline for this order, as ledger rows. */
  pendingPayments: OrderPaymentLike[];
}

export function useOfflineOrderDetail(orderId: string | undefined): OfflineOrderDetail {
  const input = useOfflineOrderInput();
  return useMemo(() => {
    const id = orderId ?? "";
    const sale = input.sales.find((entry) => entry.tenantId === input.tenantId && (entry.localId === id || entry.syncedOrderId === id));
    const edits = input.edits.filter((edit) => edit.tenantId === input.tenantId);
    const serverOrderId = sale?.syncedOrderId ?? id;
    return {
      serverOrderId,
      isDeviceOnly: isSaleUnwritten(sale),
      localOrder: sale ? applyOrderEdits(queuedSaleToOrder(sale), edits) : null,
      withEdits: (order) => applyOrderEdits(order, edits),
      pendingPayments: localPaymentsFor(serverOrderId, edits),
    };
  }, [orderId, input]);
}

type SafeMutation = (args?: unknown) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * `useSafeMutation` for order changes that also works offline. Any other ref
 * passes straight through.
 */
export function useOfflineOrderMutation(ref: FunctionReference<"mutation">): SafeMutation {
  const live = useSafeMutation(ref);
  const tenantId = useScopedTenantId();
  const backend = useOrderBackend();
  const refName = String(ref);

  return useCallback<SafeMutation>(
    async (args) => {
      if (!isOrderEditRef(refName) || !tenantId || !isRecord(args)) return live(args);
      // A Convex sale written since the screen loaded is addressed by its real id.
      const requested = String(args.orderId ?? "");
      const sale = findQueuedSale(
        getOutbox().sales.filter((entry) => entry.tenantId === tenantId),
        requested
      );
      const orderArgs = sale?.syncedOrderId ? { ...args, orderId: sale.syncedOrderId } : args;
      return writeOrderChange({
        ref: refName,
        args: orderArgs,
        tenantId,
        backend,
        live,
        isOrderOnDeviceOnly: () => isSaleUnwritten(sale),
        hasEarlierEdits: (orderId) =>
          getOrderEdits().edits.some((edit) => edit.tenantId === tenantId && edit.orderId === orderId),
      });
    },
    [live, refName, tenantId, backend]
  );
}
