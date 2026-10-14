import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** The phone's Reduce Motion setting, kept current while the screen is open. */
export function useReducedMotion(): boolean {
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) setIsReducedMotion(enabled);
      })
      // Absent on some builds; motion simply stays on.
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setIsReducedMotion
    );
    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  return isReducedMotion;
}

/** Whether VoiceOver / TalkBack is on, kept current while the screen is open. */
export function useScreenReaderEnabled(): boolean {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (isMounted) setIsEnabled(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setIsEnabled);
    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  return isEnabled;
}
