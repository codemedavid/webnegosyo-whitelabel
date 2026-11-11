import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { leaveTo, parseReturnTo, type ReturnRouter } from "../lib/return-to";

/**
 * A screen's Back when it may have been opened by a cross-link carrying
 * `returnTo` (lib/return-to.ts). Without one, Back is the ordinary
 * `router.back()`. Android's hardware back follows the same rule while the
 * screen is focused.
 */
export function useReturnTo(raw: unknown): { returnTo: string | null; leave: () => void } {
  const returnTo = parseReturnTo(raw);
  const leave = useCallback(() => leaveTo(router as unknown as ReturnRouter, returnTo), [returnTo]);

  useFocusEffect(
    useCallback(() => {
      if (!returnTo || Platform.OS !== "android") return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        leave();
        return true;
      });
      return () => subscription.remove();
    }, [returnTo, leave]),
  );

  return { returnTo, leave };
}
