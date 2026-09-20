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

export function StaffStatStrip({ stats }: { stats: readonly StaffStatProps[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {stats.map((stat) => (
        <View key={stat.label} style={styles.tile}>
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
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
