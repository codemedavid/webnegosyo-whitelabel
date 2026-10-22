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

export function routeFromPushData(data: unknown): string | null {
  return announcementRouteFromPushData(data) ?? stockAlertRouteFromPushData(data) ?? billReminderRouteFromPushData(data);
}
