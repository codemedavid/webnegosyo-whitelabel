import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { Audio } from "expo-av";

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
      playAlertSound();

      const latest = newOrders[0];
      Alert.alert(
        "New Order!",
        `${latest.customerName} — ₱${latest.total.toFixed(2)} (${latest.itemCount} item${latest.itemCount !== 1 ? "s" : ""})`,
        [{ text: "OK" }]
      );
    }

    prevIdsRef.current = currentIds;
  }, [orders, enabled]);
}

async function playAlertSound() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: "https://cdn.pixabay.com/audio/2024/11/27/audio_c777bdd828.mp3" },
      { shouldPlay: true, volume: 1.0 }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if ("didJustFinish" in status && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch (e) {
    console.warn("Failed to play alert sound:", e);
  }
}
