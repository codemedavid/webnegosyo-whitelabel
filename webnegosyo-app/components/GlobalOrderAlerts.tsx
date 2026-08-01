import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../lib/hooks";
import { useAuthStore } from "../stores/auth-store";
import { OrderAlerts } from "../hooks/useOrderAlerts";
import { shouldAlertOnNewOrders, type AlertableOrder } from "../lib/order-alerts-utils";
import { selectIncomingOrders, type RealtimeQueue } from "../lib/pos-incoming";
import { filterOrdersToScope } from "../lib/branch-scope";
import { useBranchScope } from "../lib/use-branch-scope";

// TODO: Replace double assertion with a generated Convex function reference once
// codegen is wired into the mobile app (same workaround used across the screens).
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;

/**
 * App-wide new-order ringtone host. Mounted once in the (main) tab layout so a
 * new pending order rings on EVERY tab (Orders, Analytics, …) and not only on
 * the Dashboard — previously the only screen that mounted <OrderAlerts>.
 *
 * Subscribes to the same reactive `getRealtimeQueue` the dashboard uses, so
 * Convex de-dupes the query (no extra backend cost). Renders nothing. The native
 * audio player inside OrderAlerts is still constructed lazily on the first real
 * order, so mounting this at layout time touches no native audio code on the
 * post-login path. Gated to a real, live merchant session — never the read-only
 * demo, which must stay silent.
 */
export function GlobalOrderAlerts() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);

  const { data: queue } = useSafeQuery<Record<string, AlertableOrder[]>>(getRealtimeQueueRef);
  // Called before the early return below so the hook order stays stable.
  const scope = useBranchScope();

  if (!shouldAlertOnNewOrders({ convexUrl, orderBackend, isDemo })) return null;

  // Still pending-only — an order the kitchen has already confirmed is not news.
  // Routed through the shared selector so a sale rung up at the register can
  // never ring the register that rang it.
  // A branch account is only on the hook for its own branch: another branch
  // taking an order must not ring this device.
  const pending = selectIncomingOrders({
    pending: [...filterOrdersToScope(scope, queue?.pending)],
  } as RealtimeQueue);

  return <OrderAlerts orders={pending} />;
}
