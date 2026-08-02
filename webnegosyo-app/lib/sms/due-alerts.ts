/**
 * Handing the due-notification plan to Android.
 *
 * The decisions all live in `due-notifications.ts`, which is pure and fully
 * tested. This is the adapter: it remembers which occurrences it has already
 * scheduled, asks the planner what changed, and calls expo-notifications. Like
 * `android-permissions.ts` it imports native modules, so nothing under test
 * imports it.
 *
 * Two things are deliberate:
 *
 *  - **Its own channel, at DEFAULT importance.** The `orders` channel is MAX
 *    importance with a ringtone, because a customer is waiting. A campaign
 *    reminder that sounds identical is how that ringtone stops meaning
 *    anything.
 *  - **It never throws.** This runs as a side effect of loading the Customers
 *    screen. A notification that cannot be scheduled — permission refused,
 *    storage unavailable — must not turn into an error state on a screen whose
 *    actual job is listing guests.
 */

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { planDueNotifications } from "./due-notifications";
import type { CampaignDueState } from "./due-runs";

const STORAGE_KEY = "sms.scheduledDueKeys";
const CHANNEL_ID = "campaigns";

/** Matches the campaign defaults; nothing is delivered inside this window. */
const QUIET_HOURS_START = "21:00";
const QUIET_HOURS_END = "08:00";

let channelReady = false;

async function ensureCampaignChannel(): Promise<void> {
  if (Platform.OS !== "android" || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Campaign reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  channelReady = true;
}

async function readKnownKeys(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    // A corrupt or unavailable store means "nothing scheduled". The worst case
    // is one duplicate reminder, which is far better than never reminding.
    return [];
  }
}

/**
 * Bring Android's scheduled notifications in line with the campaigns as they
 * stand right now. Safe to call on every screen load.
 */
export async function syncDueCampaignAlerts(
  states: readonly CampaignDueState[],
  now: Date = new Date()
): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    await ensureCampaignChannel();

    const plan = planDueNotifications({
      states,
      knownKeys: await readKnownKeys(),
      now,
      quietHoursStart: QUIET_HOURS_START,
      quietHoursEnd: QUIET_HOURS_END,
    });

    // Cancel first: a rescheduled campaign produces a new occurrence key, and
    // the stale notification must not still fire at the old time.
    for (const key of plan.cancelKeys) {
      await Notifications.cancelScheduledNotificationAsync(key).catch(() => {});
    }

    for (const notification of plan.schedule) {
      await Notifications.scheduleNotificationAsync({
        // Our own occurrence key as the identifier, so cancelling later needs
        // no second bookkeeping table.
        identifier: notification.key,
        content: {
          title: notification.title,
          body: notification.body,
          data: { campaignId: notification.campaignId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notification.fireAt,
          channelId: CHANNEL_ID,
        },
      });
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plan.keepKeys));
  } catch {
    // Never surface as a screen error — see the module comment.
  }
}
