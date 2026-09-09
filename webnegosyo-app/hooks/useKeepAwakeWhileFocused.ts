import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

/**
 * Keep the screen on only while this tab is the one being looked at.
 *
 * `useKeepAwake()` holds the wake lock for as long as the component is
 * mounted — and tabs mount once and never unmount, so a cook who opened the
 * board once left every other tab, and the whole device, unable to dim.
 * Focus is the right lifetime: the lock is taken when the tab comes into view
 * and released when it leaves.
 */
export function useKeepAwakeWhileFocused(tag: string): void {
  useFocusEffect(
    useCallback(() => {
      activateKeepAwakeAsync(tag).catch(() => {
        // Not available (Expo Go on some platforms) — a dimming board beats a crash.
      });
      return () => {
        deactivateKeepAwake(tag).catch(() => {});
      };
    }, [tag]),
  );
}
