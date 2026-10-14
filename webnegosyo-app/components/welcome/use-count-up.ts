import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

/** A number that runs up from 0 to `target` once, after `delay`. */
export function useCountUp(
  target: number,
  { delay, duration, isReducedMotion }: { delay: number; duration: number; isReducedMotion: boolean }
): number {
  const [value, setValue] = useState(isReducedMotion ? target : 0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isReducedMotion) {
      setValue(target);
      return;
    }
    const listener = progress.addListener(({ value: p }) => setValue(Math.round(p * target)));
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.removeListener(listener);
    };
  }, [target, delay, duration, isReducedMotion, progress]);

  return value;
}
