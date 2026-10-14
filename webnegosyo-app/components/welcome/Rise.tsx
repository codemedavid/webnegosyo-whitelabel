import React, { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

/**
 * One entrance on the welcome screen: the wrapped view arrives once, after
 * `delay`, when it mounts. Each screen remounts its scene, so the story
 * replays every time the carousel comes back to it. With Reduce Motion on,
 * everything is simply there.
 */
export type RiseMotion = "up" | "right" | "drop" | "stamp" | "pop" | "fade";

interface RiseProps {
  delay?: number;
  motion?: RiseMotion;
  isReducedMotion: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const DURATION_MS = 450;
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const OVERSHOOT = Easing.out(Easing.back(1.6));

function motionStyle(motion: RiseMotion, p: Animated.Value) {
  const opacity = p.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });
  switch (motion) {
    case "up":
      return { opacity, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] };
    case "right":
      return { opacity, transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] };
    case "drop":
      return {
        opacity,
        transform: [
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
          { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      };
    case "stamp":
      return {
        opacity,
        transform: [
          { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
          { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ["-14deg", "0deg"] }) },
        ],
      };
    case "pop":
      return { opacity, transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] };
    case "fade":
      return { opacity: p };
  }
}

export function Rise({ delay = 0, motion = "up", isReducedMotion, style, children }: RiseProps) {
  const progress = useRef(new Animated.Value(isReducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (isReducedMotion) {
      progress.setValue(1);
      return;
    }
    const isBouncy = motion === "pop" || motion === "stamp";
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration: DURATION_MS,
      easing: isBouncy ? OVERSHOOT : EASE_OUT,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, motion, isReducedMotion, progress]);

  return <Animated.View style={[style, motionStyle(motion, progress)]}>{children}</Animated.View>;
}
