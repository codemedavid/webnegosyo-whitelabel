import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, radius, spacing } from "../theme/colors";
import type { VerdictTone } from "../lib/branch-verdict";

/**
 * The one instruction attached to a branch.
 *
 * Tone-coloured rather than icon-led so the whole list can be triaged with a
 * glance down the left edge: red is losing money, amber has a lever to pull,
 * green is working. Grey means the platform is not claiming anything.
 */

interface VerdictPillProps {
  label: string;
  tone: VerdictTone;
}

const TONE_STYLE: Record<VerdictTone, { bg: string; fg: string }> = {
  good: { bg: colors.successLight, fg: colors.success },
  warn: { bg: colors.warningLight, fg: colors.statusPending.text },
  bad: { bg: colors.dangerLight, fg: colors.danger },
  neutral: { bg: colors.surfaceSubtle, fg: colors.textSecondary },
};

export function VerdictPill({ label, tone }: VerdictPillProps) {
  const palette = TONE_STYLE[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <View style={[styles.dot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { ...typography.small, fontWeight: "700", letterSpacing: 0.3 },
});
