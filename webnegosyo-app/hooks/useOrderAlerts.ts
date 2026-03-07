import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useAudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ringtoneSource = require("../assets/ringtone.mp3");

interface OrderAlertOptions {
  orders: Array<{ _id: string; customerName: string; total: number; itemCount: number }> | undefined;
  enabled?: boolean;
}

export function useOrderAlerts({ orders, enabled = true }: OrderAlertOptions) {
  const player = useAudioPlayer(ringtoneSource);
  const prevIdsRef = useRef<Set<string> | null>(null);

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
      const body = `${latest.customerName} — ₱${latest.total.toFixed(2)} (${latest.itemCount} item${latest.itemCount !== 1 ? "s" : ""})`;

      // Play custom ringtone sound in-app
      try {
        player.seekTo(0);
        player.play();
      } catch {
        // Silently fail if audio can't play
      }

      // Schedule local push notification (visible in notification tray / when app is backgrounded)
      Notifications.scheduleNotificationAsync({
        content: {
          title: "New Order!",
          body,
          sound: "default",
        },
        trigger: null,
      }).catch(() => {});

      // Show in-app alert dialog
      Alert.alert("New Order!", body, [{ text: "OK" }]);
    }

    prevIdsRef.current = currentIds;
  }, [orders, enabled, player]);
}
