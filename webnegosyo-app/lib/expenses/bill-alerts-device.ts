/**
 * Bill reminders on this phone: `bill-alerts.ts` bound to expo-notifications
 * and AsyncStorage (the same adapter split as lib/sms/due-alerts.ts). It
 * imports native modules, so nothing under test imports it; every decision
 * lives in `bill-alerts.ts`.
 *
 * The channel is its own, DEFAULT importance with the system sound: never the
 * `orders` channel and its ringtone. Runs are serialised, so a focus and a
 * data refresh landing together never schedule twice.
 */

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  BILL_REMINDER_CHANNEL_ID,
  BILL_REMINDER_CHANNEL_NAME,
  clearBillAlerts,
  ensurePermission,
  planBillAlerts,
  syncBillAlerts,
  type BillAlertBoard,
  type BillAlertNotifier,
  type BillAlertPorts,
  type ReminderPermission,
} from "./bill-alerts";

let channelReady = false;

type PermissionAnswer = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;

function toPermission(answer: PermissionAnswer): ReminderPermission {
  if (answer.granted || answer.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return "granted";
  return answer.status === "denied" ? "denied" : "undetermined";
}

const notifier: BillAlertNotifier = {
  permission: async () => toPermission(await Notifications.getPermissionsAsync()),
  requestPermission: async () => toPermission(await Notifications.requestPermissionsAsync()),
  ensureChannel: async () => {
    if (Platform.OS !== "android" || channelReady) return;
    await Notifications.setNotificationChannelAsync(BILL_REMINDER_CHANNEL_ID, {
      name: BILL_REMINDER_CHANNEL_NAME,
      description: "A morning nudge before rent, kuryente and other bills are due",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
    channelReady = true;
  },
  scheduledIds: async () => (await Notifications.getAllScheduledNotificationsAsync()).map((request) => request.identifier),
  schedule: async (alert) => {
    await Notifications.scheduleNotificationAsync({
      identifier: alert.id,
      content: {
        title: alert.title,
        body: alert.body,
        sound: "default",
        data: { ...alert.data },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(alert.fireAtMs),
        channelId: BILL_REMINDER_CHANNEL_ID,
      },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};

const ports: BillAlertPorts = { notifier, store: AsyncStorage };

let queue: Promise<unknown> = Promise.resolve();

function serialised<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/** Re-plan this account's reminders from the bills board. Never throws. */
export function syncBillRemindersOnDevice(ownerKey: string, board: BillAlertBoard, nowMs: number = Date.now()): Promise<void> {
  return serialised(async () => {
    await syncBillAlerts(ownerKey, planBillAlerts(board, nowMs), ports);
  });
}

/** Signed out, or an account that must not be reminded: no bill reminder stays. Never throws. */
export function clearBillRemindersOnDevice(): Promise<void> {
  return serialised(async () => {
    await clearBillAlerts(ports);
  });
}

/**
 * For the bill editor, after the FIRST bill is saved: asks for notification
 * permission once if it was never asked, then schedules. True when reminders
 * can show. Never call it on app start.
 */
export function ensureBillReminderPermission(): Promise<boolean> {
  return ensurePermission(notifier);
}
