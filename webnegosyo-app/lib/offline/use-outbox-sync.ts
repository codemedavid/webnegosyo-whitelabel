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

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { resolveOrderBackend } from "../order-backend";
import { syncOutbox } from "./sync-outbox";
import { FRESH_SALE_GRACE_MS, summarizePendingSales } from "./pending-sales";
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

/**
 * How many of this store's sales are still waiting to reach the server.
 *
 * A sale inside its write-behind grace period is not reported (see
 * `pending-sales.ts`); a timer re-reads once that period is over, so a sale
 * that really is slow still reaches the banner.
 */
export function usePendingSaleCounts(): PendingSaleCounts {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const outbox = useOutbox();
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const backend = resolveOrderBackend({ order_backend: orderBackend, convex_deployment_url: convexUrl });
  const { status } = useConnectivity();
  const [now, setNow] = useState(() => Date.now());

  const summary = summarizePendingSales(outbox.sales, {
    tenantId,
    backend,
    now,
    isOnline: status !== "offline",
  });

  useEffect(() => {
    if (!summary.hasFreshSales) return;
    const timer = setTimeout(() => setNow(Date.now()), FRESH_SALE_GRACE_MS + 500);
    return () => clearTimeout(timer);
  }, [summary.hasFreshSales, outbox]);

  return { pending: summary.pending, stuck: summary.stuck };
}

export const OUTBOX_RETRY_INTERVAL_MS = 20_000;

export function useOutboxSync(): void {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const backend = resolveOrderBackend({ order_backend: orderBackend, convex_deployment_url: convexUrl });
  const createOrder = useSafeMutation(createOrderRef);
  const updatePaymentStatus = useSafeMutation(updatePaymentStatusRef);
  const mutations = useRef({ createOrder, updatePaymentStatus });
  mutations.current = { createOrder, updatePaymentStatus };
  const { status } = useConnectivity();
  const outbox = useOutbox();

  // A count, not a boolean: with write-behind every counter sale passes
  // through the outbox, and a second sale queued while the first is still
  // syncing must trigger a run too (`syncOutbox` folds it into a follow-up).
  const pendingCount = outbox.sales.filter(
    (sale) => sale.tenantId === tenantId && sale.backend === backend && !needsAttention(sale)
  ).length;

  useEffect(() => {
    if (!tenantId || isDemo || status !== "online") {
      void hydrateOutbox().catch((error) => console.warn("[offline] Could not read queued sales:", error));
      return;
    }
    let active = true;
    const isActive = () => {
      const auth = useAuthStore.getState();
      return active && auth.isAuthenticated && !auth.isDemo && auth.userId === userId &&
        (auth.impersonatedTenantId ?? auth.tenantId) === tenantId &&
        auth.convexUrl === convexUrl && auth.orderBackend === orderBackend;
    };
    const sync = () => {
      if (AppState.currentState !== "active" || !isActive()) return;
      void hydrateOutbox()
        .then(() => syncOutbox({ tenantId, backend, ...mutations.current, isActive }))
        .catch((error) => console.warn("[offline] Could not sync queued sales:", error));
    };
    sync();
    // A queue change during an in-flight run, or a refused sale, must get
    // another chance without requiring a connectivity change or app restart.
    const timer = setInterval(sync, OUTBOX_RETRY_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") sync();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [tenantId, userId, isDemo, orderBackend, convexUrl, backend, status, pendingCount]);
}
