import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ringtoneSource = require("../assets/ringtone.mp3");

interface OrderAlertOptions {
  orders: Array<{ _id: string; customerName?: string; total?: number; itemCount?: number }> | undefined;
  enabled?: boolean;
}

export function useOrderAlerts({ orders, enabled = true }: OrderAlertOptions) {
  const prevIdsRef = useRef<Set<string> | null>(null);
  // The native audio player is created LAZILY (only when a real new order
  // arrives), never at render. See note on OrderAlerts below — constructing it
  // during the post-login dashboard mount raced the native navigation
  // transition and hard-crashed iOS (SIGABRT on the TurboModule queue while the
  // UINavigationController was mid setViewControllers).
  const playerRef = useRef<AudioPlayer | null>(null);

  // Release the native player when the alert host unmounts (e.g. sign out).
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        // Player already released — ignore.
      }
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !orders) return;

    const currentIds = new Set(orders.map((o) => o._id));

    // Skip first render (initial load)
    if (prevIdsRef.current === null) {
      prevIdsRef.current = currentIds;
      return;
    }

    // Find genuinely new orders (IDs we haven't seen)
    const newOrders = orders.filter((o) => !prevIdsRef.current!.has(o._id));

    if (newOrders.length > 0) {
      const latest = newOrders[0];
      const name = latest.customerName ?? "Customer";
      const total = (latest.total ?? 0).toFixed(2);
      const count = latest.itemCount ?? 0;
      const body = `${name} — ₱${total} (${count} item${count !== 1 ? "s" : ""})`;

      // Play the custom ringtone in-app. The native player is constructed here,
      // on first use — long after the navigation transition has settled — so it
      // can never collide with the dashboard mount. If construction or playback
      // fails, the local notification below is still a reliable audible fallback.
      try {
        if (!playerRef.current) {
          playerRef.current = createAudioPlayer(ringtoneSource);
        }
        const player = playerRef.current;
        // seekTo returns a promise; restart from the top then play.
        Promise.resolve(player.seekTo(0)).catch(() => {});
        player.play();
      } catch {
        // Audio is best-effort — never let it break the alert.
      }

      // Schedule local notification (visible in notification tray). Fire it on
      // the high-importance "orders" channel so Android rings the custom
      // ringtone instead of using the silent default channel. trigger with only
      // a channelId fires immediately (ChannelAwareTriggerInput); ignored on iOS.
      Notifications.scheduleNotificationAsync({
        content: {
          title: "New Order!",
          body,
          sound: "default",
        },
        trigger: { channelId: "orders" },
      }).catch(() => {});

      // Show in-app alert dialog
      Alert.alert("New Order!", body, [{ text: "OK" }]);
    }

    prevIdsRef.current = currentIds;
  }, [orders, enabled]);
}

/**
 * Renderable wrapper around {@link useOrderAlerts}. The native audio player is
 * created lazily on the first new order (never at render), so mounting this
 * component is cheap and touches no native audio code on the critical
 * post-login dashboard mount. It is still mounted conditionally (only for a
 * real, live merchant session — NOT the read-only demo) so App Store reviewers
 * never get surprise "New Order!" pop-ups over the demo store.
 */
export function OrderAlerts({ orders }: { orders: OrderAlertOptions["orders"] }) {
  useOrderAlerts({ orders, enabled: true });
  return null;
}
