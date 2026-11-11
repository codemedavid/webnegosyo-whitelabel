import { useCallback, useEffect, useRef } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { KITCHEN_RING_INTERVAL_MS } from "../lib/kitchen-confirm";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ringtoneSource = require("../assets/ringtone.mp3");

interface KitchenRingOptions {
  /** `ringingIdsKey` of the board's ring tracker ("" = nothing ringing). */
  ringingKey: string;
  /** False while the board is not on screen, or in the demo. */
  enabled: boolean;
}

/**
 * Rings the order ringtone while any ticket waits for Confirm: at once when a
 * new ticket starts ringing, then every {@link KITCHEN_RING_INTERVAL_MS} until
 * the last one is confirmed.
 *
 * The player is constructed on the first ring, never at render — building a
 * native audio player during a navigation transition hard-crashed iOS once
 * (see useOrderAlerts). `testSound` lets a cook check the volume before a rush.
 */
export function useKitchenRing({ ringingKey, enabled }: KitchenRingOptions): { testSound: () => void } {
  const playerRef = useRef<AudioPlayer | null>(null);
  const previousIdsRef = useRef<ReadonlySet<string>>(new Set());

  const play = useCallback(() => {
    try {
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer(ringtoneSource);
      }
      const player = playerRef.current;
      Promise.resolve(player.seekTo(0)).catch(() => {});
      player.play();
    } catch {
      // Audio is best-effort; the red RINGING card still shows.
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        // Already released.
      }
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ids = new Set(ringingKey ? ringingKey.split("\u0000") : []);
    const previous = previousIdsRef.current;
    // While the board is out of view nothing counts as heard, so coming back
    // to a still-unconfirmed ticket rings at once instead of 15 s later.
    previousIdsRef.current = enabled ? ids : new Set();
    if (!enabled || ids.size === 0) {
      try {
        playerRef.current?.pause();
      } catch {
        // Nothing playing.
      }
      return;
    }

    const hasNewTicket = [...ids].some((id) => !previous.has(id));
    if (hasNewTicket) play();
    const timer = setInterval(play, KITCHEN_RING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ringingKey, enabled, play]);

  return { testSound: play };
}
