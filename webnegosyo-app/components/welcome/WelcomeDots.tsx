import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { WELCOME_COLORS } from "../../lib/welcome/slides";

interface WelcomeDotsProps {
  count: number;
  activeIndex: number;
  /** How long the active screen stays; the active dot fills over it. */
  durationMs: number;
  isReducedMotion: boolean;
  onSelect: (index: number) => void;
}

function ActiveFill({ durationMs, isReducedMotion }: { durationMs: number; isReducedMotion: boolean }) {
  const fill = useRef(new Animated.Value(isReducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (isReducedMotion) {
      fill.setValue(1);
      return;
    }
    const animation = Animated.timing(fill, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [durationMs, fill, isReducedMotion]);
  return <Animated.View style={[styles.fill, { transformOrigin: "left", transform: [{ scaleX: fill }] }]} />;
}

export function WelcomeDots({ count, activeIndex, durationMs, isReducedMotion, onSelect }: WelcomeDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => {
        const isActive = i === activeIndex;
        return (
          <Pressable
            key={i}
            onPress={() => onSelect(i)}
            accessibilityRole="button"
            accessibilityLabel={`Show screen ${i + 1} of ${count}`}
            accessibilityState={{ selected: isActive }}
            style={styles.target}
          >
            <View style={[styles.dot, isActive && styles.activeDot]}>
              {/* keyed by screen so the fill restarts whenever the screen changes */}
              {isActive && <ActiveFill key={activeIndex} durationMs={durationMs} isReducedMotion={isReducedMotion} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", marginVertical: -19 },
  // 44pt tall, and wide enough that neighbouring targets never overlap.
  target: { paddingVertical: 19, paddingHorizontal: 7 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#DADADA", overflow: "hidden" },
  activeDot: { width: 28 },
  fill: { flex: 1, backgroundColor: WELCOME_COLORS.ink },
});
