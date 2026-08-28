/**
 * Handing the pre-order reminder plan to the OS.
 *
 * The decisions live in `scheduled-reminders.ts`, which is pure and fully
 * tested. This is the adapter (same split as lib/sms/due-alerts.ts): it
 * remembers which occurrences this device already scheduled, asks the planner
 * what changed, and calls expo-notifications. It imports native modules, so
 * nothing under test imports it.
 *
 * Unlike the campaign reminders this targets the existing MAX-importance
 * `orders` channel with the ringtone, on BOTH platforms: a pre-order coming
 * due is a customer about to walk in, the same event the new-order chime
 * announces — not marketing housekeeping. And it never throws: it runs as a
 * side effect of the app-wide alert host, whose actual job is ringing on new
 * orders.
 */

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { planScheduledReminders, type ReminderOrderLike } from "./scheduled-reminders";
import { ensureOrdersChannel } from "./notifications";

const STORAGE_KEY = "scheduled.reminderKeys";

async function readKnownKeys(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    // A corrupt or unavailable store means "nothing scheduled". The worst case
    // is one duplicate reminder, far better than never reminding.
    return [];
  }
}

/**
 * Bring the OS's scheduled reminders in line with the live pre-orders. Safe to
 * call on every queue update; the planner makes it a no-op when nothing moved.
 */
export async function syncScheduledOrderReminders(
  orders: readonly ReminderOrderLike[] | undefined,
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    if (Platform.OS === "android") await ensureOrdersChannel();

    const plan = planScheduledReminders({
      orders,
      knownKeys: await readKnownKeys(),
      nowMs,
    });
    if (plan.schedule.length === 0 && plan.cancelKeys.length === 0) return;

    // Cancel first: an edited pre-order produces a new occurrence key, and the
    // stale reminder must not still fire at the old time.
    for (const key of plan.cancelKeys) {
      await Notifications.cancelScheduledNotificationAsync(key).catch(() => {});
    }

    for (const reminder of plan.schedule) {
      await Notifications.scheduleNotificationAsync({
        // The occurrence key as the identifier, so cancelling later needs no
        // second bookkeeping table.
        identifier: reminder.key,
        content: {
          title: reminder.title,
          body: reminder.body,
          sound: "ringtone.mp3",
          data: { orderId: reminder.orderId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.fireAtMs),
          channelId: "orders",
        },
      });
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plan.keepKeys));
  } catch {
    // Never surface as a screen error — see the module comment.
  }
}
