import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../theme/colors";

interface GrowthIndicatorProps {
  value: number; // decimal, e.g. 0.12 = 12%
}

export function GrowthIndicator({ value }: GrowthIndicatorProps) {
  const isPositive = value >= 0;
  const pct = (Math.abs(value) * 100).toFixed(1);
  const arrow = isPositive ? "\u2191" : "\u2193";
  const color = isPositive ? colors.success : colors.danger;

  return (
    <View style={[styles.container, { backgroundColor: isPositive ? colors.statusReady.bg : colors.statusCancelled.bg }]}>
      <Text style={[styles.text, { color }]}>
        {arrow} {pct}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  text: {
    ...typography.small,
    fontWeight: "700",
  },
});
