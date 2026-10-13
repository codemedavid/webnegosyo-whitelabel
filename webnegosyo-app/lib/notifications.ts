import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { APPROVAL_PUSH_CATEGORIES, APPROVALS_CHANNEL_ID } from "./approvals/push-route";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Track whether we've already (re)created the high-importance "orders" channel
// this app session, so callers can invoke ensureOrdersChannel freely.
let ordersChannelReady = false;

/**
 * Create the high-importance "orders" Android channel that rings the custom
 * ringtone. Safe to call repeatedly and BEFORE any permission prompt — creating
 * a channel does not require notification permission. Both remote pushes and
 * local notifications target this channel via `channelId: "orders"`, so it must
 * exist before the first order arrives. No-op on iOS.
 *
 * It is created, never deleted-and-recreated. A previous version deleted the
 * channel first, meaning to force new sound/vibration settings onto devices
 * that already had it — which Android does not allow: recreating a channel
 * under an id that was deleted RESTORES the original settings. So the delete
 * changed nothing, and it opened a window at every launch where an arriving
 * order had no "orders" channel to land on. expo-notifications then posts it
 * to its low-importance fallback channel instead: no ringtone, no heads-up,
 * on the one notification this app exists to deliver.
 *
 * Changing the ringtone or importance for existing installs therefore needs a
 * NEW channel id here and in every sender (`channelId` in the order push
 * payload) — not a delete.
 */
export async function ensureOrdersChannel(): Promise<void> {
  if (Platform.OS !== "android" || ordersChannelReady) return;
  await Notifications.setNotificationChannelAsync("orders", {
    name: "New Orders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: "ringtone.mp3",
  });
  ordersChannelReady = true;
}

let approvalsChannelReady = false;

/**
 * The Android `approvals` channel: HIGH importance, the default sound (never
 * the new-order ringtone, so a request never sounds like an order) and a
 * vibration. Resolves whether it exists, because the device token reports it
 * (`deviceChannels`) and the server only targets a channel the phone created —
 * a push to a missing channel is dropped silently. iOS has no channels.
 */
export async function ensureApprovalsChannel(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (approvalsChannelReady) return true;
  try {
    await Notifications.setNotificationChannelAsync(APPROVALS_CHANNEL_ID, {
      name: "Approval requests",
      description: "Refunds and cancels your team asks you to approve",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      sound: "default",
    });
    approvalsChannelReady = true;
  } catch (error: unknown) {
    console.warn("[notifications] approvals channel failed:", error instanceof Error ? error.message : error);
  }
  return approvalsChannelReady;
}

/** The channels this install has created, for `platform_device_tokens.channels`. */
export function deviceChannels(): string[] {
  return approvalsChannelReady ? [APPROVALS_CHANNEL_ID] : [];
}

/**
 * Registers the Approve / Decline actions (design-spec §3.12). Before the
 * token is requested, so the first request push already has its buttons.
 */
export async function ensureApprovalCategories(): Promise<void> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  for (const category of APPROVAL_PUSH_CATEGORIES(platform)) {
    try {
      await Notifications.setNotificationCategoryAsync(category.identifier, category.actions);
    } catch (error: unknown) {
      console.warn("[notifications] approval category failed:", error instanceof Error ? error.message : error);
    }
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  // Make sure the ringtone channel exists even on devices/emulators where we
  // bail out below — local in-app order alerts still rely on it.
  await ensureOrdersChannel();
  await ensureApprovalsChannel();
  await ensureApprovalCategories();

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  // Get the Expo push token — projectId required in Expo Go / bare workflow
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.log("No EAS projectId found — push tokens require an EAS project. Skipping.");
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}
