import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

/**
 * The figures above a staff screen.
 *
 * A horizontal rail rather than a grid: five numbers stacked two-up on a
 * phone push the roster below the fold, and the roster is what the screen is
 * for. The first three tiles are the ones that matter at a glance, and they
 * fit without scrolling on every device the app supports.
 */

export type StatTone = "default" | "positive" | "warning";

export interface StaffStatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}

const TONE_COLOR: Record<StatTone, string> = {
  default: colors.textPrimary,
  positive: colors.success,
  warning: colors.statusPending.text,
};

interface StaffStatStripProps {
  stats: readonly StaffStatProps[];
  /**
   * `grid` wraps every tile into view. A person's own screen has no roster
   * below to protect, and a rail there hid Cancelled and Shifts off the edge.
   */
  layout?: "rail" | "grid";
}

export function StaffStatStrip({ stats, layout = "rail" }: StaffStatStripProps) {
  if (layout === "grid") {
    return (
      <View style={styles.grid}>
        {stats.map((stat) => (
          <StatTile key={stat.label} stat={stat} style={styles.gridTile} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {stats.map((stat) => (
        <StatTile key={stat.label} stat={stat} />
      ))}
    </ScrollView>
  );
}

function StatTile({ stat, style }: { stat: StaffStatProps; style?: object }) {
  return (
    <View style={[styles.tile, style]}>
      <Text style={styles.label} numberOfLines={1}>
        {stat.label}
      </Text>
      <Text style={[styles.value, { color: TONE_COLOR[stat.tone ?? "default"] }]} numberOfLines={1}>
        {stat.value}
      </Text>
      {stat.hint ? (
        <Text style={styles.hint} numberOfLines={1}>
          {stat.hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  // Two per row on a phone: flexBasis below half leaves room for the gap.
  gridTile: { flexBasis: "47%", flexGrow: 1, minWidth: 0 },
  rail: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
  tile: {
    minWidth: 116,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.sm,
  },
  label: { ...typography.eyebrow, color: colors.textSecondary },
  value: { fontSize: 20, fontWeight: "800", marginTop: spacing.xs },
  hint: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
});
