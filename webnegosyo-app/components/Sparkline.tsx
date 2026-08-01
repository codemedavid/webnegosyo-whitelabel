import React from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";

import { colors } from "../theme/colors";

/**
 * A branch's shape over the period, in the space of one line of text.
 *
 * Deliberately unlabelled and un-axed. On a phone card the question is never
 * "what did Tuesday take?" — it is "is this branch climbing or sliding?", and
 * that reads faster from a silhouette than from a chart with furniture. The
 * exact figures live in the KPI row directly beneath it.
 *
 * No charting library: a fixed set of flexed bars renders identically on both
 * platforms and costs nothing to mount inside a scrolling list of cards.
 */

interface SparklineProps {
  /** One value per period day, chronological. */
  values: readonly number[];
  color?: string;
  height?: number;
  /** Dims every bar but the last, so today reads as today. */
  highlightLast?: boolean;
  style?: ViewStyle;
}

/** Bars past this many get too thin to see, so older days are dropped. */
const MAX_BARS = 30;

/** A day with sales must never render as nothing at all. */
const MIN_VISIBLE_RATIO = 0.06;

export function Sparkline({
  values,
  color = colors.primary,
  height = 34,
  highlightLast = false,
  style,
}: SparklineProps) {
  // Keep the most recent days: the far end of a 90-day window is the least
  // useful part of the picture.
  const series = values.length > MAX_BARS ? values.slice(values.length - MAX_BARS) : values;

  if (series.length === 0) {
    return <View style={[styles.container, { height }, style]} />;
  }

  const peak = Math.max(...series, 0);

  return (
    <View style={[styles.container, { height }, style]} accessibilityElementsHidden>
      {series.map((value, index) => {
        // A flat run of zeroes stays a flat floor rather than becoming full-height.
        const ratio = peak > 0 ? value / peak : 0;
        const isLast = index === series.length - 1;
        return (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: Math.max(ratio * height, value > 0 ? height * MIN_VISIBLE_RATIO : 2),
                backgroundColor: value > 0 ? color : colors.separator,
                opacity: highlightLast && !isLast ? 0.35 : 1,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 2,
  },
});
