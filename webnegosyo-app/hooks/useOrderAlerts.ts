import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import * as Notifications from "expo-notifications";

interface OrderAlertOptions {
  orders: Array<{ _id: string; customerName: string; total: number; itemCount: number }> | undefined;
  enabled?: boolean;
}

export function useOrderAlerts({ orders, enabled = true }: OrderAlertOptions) {
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

      // Schedule immediate local notification (plays system sound)
      Notifications.scheduleNotificationAsync({
        content: {
          title: "New Order!",
          body,
          sound: "default",
        },
        trigger: null, // immediate
      }).catch(() => {});

      // Also show in-app alert
      Alert.alert("New Order!", body, [{ text: "OK" }]);
    }

    prevIdsRef.current = currentIds;
  }, [orders, enabled]);
}
