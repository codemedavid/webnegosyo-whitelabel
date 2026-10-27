// Where a tapped push lands. One router for every push kind the app knows,
// so the root layout has one listener. Order pushes carry neither shape and
// are left to the order screens, as before. Bill reminders are LOCAL
// notifications (lib/expenses/bill-alerts.ts) but a tap on them arrives
// through the same response listener.

import { announcementRouteFromPushData } from "../announcements/popup";
import { billReminderRouteFromPushData } from "../expenses/bill-links";
import { ingredientHref } from "../navigation";

export const NOTIFICATIONS_ROUTE = "/(main)/notifications" as const;

/** A low-stock push: one ingredient opens its page, a batch opens the bell. */
function stockAlertRouteFromPushData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, inventoryItemId } = data as { type?: unknown; inventoryItemId?: unknown };
  if (type !== "stock_alert") return null;
  if (typeof inventoryItemId === "string" && inventoryItemId !== "") {
    return ingredientHref(inventoryItemId);
  }
  return NOTIFICATIONS_ROUTE;
}

/** Where each cash notice is acted on (CONTRACTS W3.3). */
export const CASH_ALERT_ROUTES = {
  // The Drawer's floor view, where a manager ends someone else's shift.
  shift_overdue: "/(main)/pos-sales",
  remittance_pending: "/(main)/remittances",
} as const;

/** A cash push: `{type:'cash_alert', kind}`; an unknown kind opens the bell. */
function cashAlertRouteFromPushData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, kind } = data as { type?: unknown; kind?: unknown };
  if (type !== "cash_alert") return null;
  return kind === "shift_overdue" || kind === "remittance_pending" ? CASH_ALERT_ROUTES[kind] : NOTIFICATIONS_ROUTE;
}

export function routeFromPushData(data: unknown): string | null {
  return (
    announcementRouteFromPushData(data) ??
    stockAlertRouteFromPushData(data) ??
    cashAlertRouteFromPushData(data) ??
    billReminderRouteFromPushData(data)
  );
}
