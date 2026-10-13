import React from "react";
import { StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "../../theme/colors";
import { ACTIVITY_ROW_HEIGHT } from "./ActivityEventRow";

interface ActivitySkeletonProps {
  rows?: number;
}

const DEFAULT_ROWS = 6;

/**
 * Static placeholders shaped like real rows (spec §3 shared states): no
 * spinner on a first load, and no shimmer, which costs frames on low-end
 * Android for no information.
 */
export function ActivitySkeleton({ rows = DEFAULT_ROWS }: ActivitySkeletonProps) {
  return (
    <View accessible accessibilityLabel="Loading activity" accessibilityRole="progressbar">
      <View style={styles.header}>
        <View style={[styles.bar, styles.dayBar]} />
      </View>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.tile} />
          <View style={styles.copy}>
            <View style={[styles.bar, { width: `${70 - (index % 3) * 12}%` }]} />
            <View style={[styles.bar, styles.thin, { width: `${45 - (index % 2) * 10}%` }]} />
          </View>
          <View style={[styles.bar, styles.amount]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 44, justifyContent: "center", paddingHorizontal: spacing.lg },
  row: {
    height: ACTIVITY_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  tile: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSubtle },
  copy: { flex: 1, gap: spacing.sm },
  bar: { height: 12, borderRadius: radius.sm, backgroundColor: colors.primaryLight },
  thin: { height: 10 },
  dayBar: { width: 120 },
  amount: { width: 48 },
});
