/**
 * Where every "way in" to Bills to pay lands (bills-contract §5). The route
 * and its link builders live with the screen (`bills-route.ts`, owned by the
 * Bills screens); this adds what the ways in need on top:
 *
 *   /(main)/expense-bills                  the list (several bills)
 *   /(main)/expense-bills?bill=<billId>    one bill's sheet
 *   /(main)/expense-bills?new=1&…          the bill editor, pre-filled
 *
 * and where a tapped phone reminder opens. Pure.
 */

import { BILLS_PATH, billHref } from "./bills-route";

export { billHref, newBillHref } from "./bills-route";

export const BILLS_ROUTE = BILLS_PATH;

/** Where a tap on one or more bills goes: one bill opens its sheet, several open the list. */
export function billsHref(billIds: readonly string[]): string {
  return billIds.length === 1 ? billHref(billIds[0]) : BILLS_ROUTE;
}

/** `data.type` of a phone reminder for bills (`bill-alerts.ts`). */
export const BILL_REMINDER_PUSH_TYPE = "bill_reminder" as const;

/**
 * Where a tapped bill reminder opens, or null when the notification is not
 * one. Routed from its bill ids, never from a stored URL: a tap must only ever
 * land on Bills to pay.
 */
export function billReminderRouteFromPushData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, billIds } = data as { type?: unknown; billIds?: unknown };
  if (type !== BILL_REMINDER_PUSH_TYPE) return null;
  const ids = Array.isArray(billIds) ? billIds.filter((id): id is string => typeof id === "string" && id !== "") : [];
  return billsHref(ids);
}
