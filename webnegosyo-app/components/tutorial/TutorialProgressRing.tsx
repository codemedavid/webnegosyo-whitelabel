import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../../theme/colors";

/**
 * The hub's progress ring: an amber arc on the ink hero card, with the count
 * in the middle. Pure SVG, so it reads the same on both platforms.
 */
interface TutorialProgressRingProps {
  fraction: number;
  completed: number;
  total: number;
  size?: number;
}

const STROKE = 6;

export function TutorialProgressRing({ fraction, completed, total, size = 84 }: TutorialProgressRingProps) {
  const r = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, fraction));
  const isDone = total > 0 && completed >= total;
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityLabel={`${completed} of ${total} chapters complete`}
      accessibilityValue={{ min: 0, max: total, now: completed }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(253,251,247,0.16)" strokeWidth={STROKE} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={isDone ? colors.success : colors.tabBarActive}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.count}>{completed}</Text>
        <Text style={styles.of}>of {total}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  count: { fontSize: 22, fontWeight: "800", color: colors.heroInkText, letterSpacing: -0.5 },
  of: { fontSize: 10, fontWeight: "600", color: colors.heroInkMuted, marginTop: -2 },
});
