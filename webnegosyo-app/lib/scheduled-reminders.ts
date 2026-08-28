/**
 * The pre-order reminder planner.
 *
 * A scheduled order rings once when it lands — the normal new-order alert —
 * and then goes quiet, possibly for days. The board shows it, but nothing
 * *interrupts* when it is time to start cooking. This plans that second ring
 * as a local notification at lead time before the requested moment, which
 * Android/iOS deliver themselves even with the app closed.
 *
 * Same reconciliation discipline as the SMS campaign reminders
 * (lib/sms/due-notifications.ts), and for the same reasons:
 *
 *  - Identity is one order's ONE requested instant (`orderId@iso`). Keyed on
 *    the order alone, an edited pre-order would keep its stale reminder;
 *    keyed on nothing, every app launch would stack another.
 *  - A reminder whose window already started fires now rather than being
 *    skipped — a missed pre-order still on the board is the one most worth
 *    interrupting for.
 *  - Terminal orders drop out of the live set, which cancels their pending
 *    notification.
 *
 * Pure: takes orders, the keys this device already scheduled, and the clock.
 * The adapter (lib/scheduled-reminder-alerts.ts) does the native scheduling.
 */

import {
  getScheduledISO,
  getScheduledLabel,
  selectScheduledOrders,
  type ScheduledSourceOrder,
} from "./scheduled-orders";

const MS_PER_MINUTE = 60_000;
const KEY_SEPARATOR = "@";

/** Minutes of prep warning before the requested moment. */
export const REMINDER_LEAD_MINUTES = 30;

export interface ReminderOrderLike extends ScheduledSourceOrder {
  customerName?: string;
  itemCount?: number;
}

export interface ScheduledReminder {
  /** Occurrence identity — one order, one requested instant. */
  key: string;
  orderId: string;
  title: string;
  body: string;
  /** When the phone should deliver it. */
  fireAtMs: number;
}

export interface ReminderPlanInput {
  orders: readonly ReminderOrderLike[] | undefined;
  /** Occurrence keys already scheduled on this device. */
  knownKeys: readonly string[];
  nowMs: number;
  leadMinutes?: number;
}

export interface ReminderPlan {
  /** Occurrences to hand to the scheduler. */
  schedule: ScheduledReminder[];
  /** Previously scheduled keys that no longer match a live pre-order. */
  cancelKeys: string[];
  /** Every live occurrence key; persist this as the next run's `knownKeys`. */
  keepKeys: string[];
}

export function reminderKey(orderId: string, scheduledISO: string): string {
  return `${orderId}${KEY_SEPARATOR}${scheduledISO}`;
}

function bodyFor(order: ReminderOrderLike): string {
  const label = getScheduledLabel(order) ?? "soon";
  const who = order.customerName?.trim() || "A customer";
  const items =
    typeof order.itemCount === "number" && order.itemCount > 0
      ? ` · ${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`
      : "";
  return `${who}${items} — due ${label}.`;
}

export function planScheduledReminders(input: ReminderPlanInput): ReminderPlan {
  const leadMs = (input.leadMinutes ?? REMINDER_LEAD_MINUTES) * MS_PER_MINUTE;
  const live = selectScheduledOrders(input.orders);

  const keepKeys = live.map((order) =>
    reminderKey(order._id, getScheduledISO(order) as string),
  );
  const liveKeys = new Set(keepKeys);

  const schedule = live.flatMap((order, index) => {
    const key = keepKeys[index];
    if (input.knownKeys.includes(key)) return [];
    return [
      {
        key,
        orderId: order._id,
        title: "Scheduled order due soon",
        body: bodyFor(order),
        fireAtMs: Math.max(input.nowMs, order.scheduledAtMs - leadMs),
      },
    ];
  });

  const cancelKeys = input.knownKeys.filter((key) => !liveKeys.has(key));

  return { schedule, cancelKeys, keepKeys };
}
