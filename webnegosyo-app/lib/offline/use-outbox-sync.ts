/**
 * Replays queued counter sales whenever the register is online and has some.
 *
 * Mounted once in the (main) layout. The two mutations come from
 * `useSafeMutation`, the same hook the tender screen uses, so a synced sale is
 * dispatched to the same backend, timed out the same way and invalidates the
 * same queries as a live one.
 *
 * Triggers: the outbox gaining a sale while online, the belief flipping to
 * online, and the app returning to the foreground. `syncOutbox` serialises
 * overlapping triggers itself.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { FunctionReference } from "convex/server";
import { useSafeMutation } from "../hooks";
import { useAuthStore } from "../../stores/auth-store";
import {
  getOutbox,
  hydrateOutbox,
  needsAttention,
  subscribeOutbox,
  type OutboxState,
} from "./order-outbox";
import { syncOutbox } from "./sync-outbox";
import { useConnectivity } from "./use-connectivity";

const createOrderRef = "orders:createOrder" as unknown as FunctionReference<"mutation">;
const updatePaymentStatusRef =
  "orders:updatePaymentStatus" as unknown as FunctionReference<"mutation">;

export function useOutbox(): OutboxState {
  return useSyncExternalStore(subscribeOutbox, getOutbox, getOutbox);
}

export interface PendingSaleCounts {
  /** Still to be written; retried automatically. */
  pending: number;
  /** Refused too many times; left for a person. */
  stuck: number;
}

/** How many of this store's sales are still waiting to reach the server. */
export function usePendingSaleCounts(): PendingSaleCounts {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const outbox = useOutbox();
  const mine = outbox.sales.filter((sale) => sale.tenantId === tenantId);
  const stuck = mine.filter(needsAttention).length;
  return { pending: mine.length - stuck, stuck };
}

export function useOutboxSync(): void {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const createOrder = useSafeMutation(createOrderRef);
  const updatePaymentStatus = useSafeMutation(updatePaymentStatusRef);
  const { status } = useConnectivity();
  const outbox = useOutbox();

  useEffect(() => {
    void hydrateOutbox();
  }, []);

  const pending = outbox.sales.some(
    (sale) => sale.tenantId === tenantId && !needsAttention(sale)
  );

  const sync = useCallback(() => {
    if (!tenantId || isDemo || !pending) return;
    void syncOutbox({ tenantId, createOrder, updatePaymentStatus });
  }, [tenantId, isDemo, pending, createOrder, updatePaymentStatus]);

  useEffect(() => {
    if (status !== "online") return;
    sync();
  }, [status, sync]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active" && status === "online") sync();
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, [status, sync]);
}
