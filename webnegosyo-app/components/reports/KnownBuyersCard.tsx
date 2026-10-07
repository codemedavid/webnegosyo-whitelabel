import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import type { KnownBuyers, KnownTone } from "../../lib/customer-hub/dashboard";
import { Button } from "../Button";

const TONE_COLORS: Record<KnownTone, { fill: string; ground: string }> = {
  good: { fill: colors.success, ground: colors.successLight },
  fair: { fill: colors.warning, ground: colors.warningLight },
  poor: { fill: colors.accent, ground: colors.accentLight },
};

interface KnownBuyersCardProps {
  known: KnownBuyers;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * The ceiling on every customer number above it. A store that names one buyer
 * in ten is reading its regulars through a keyhole, and the fix — ask for the
 * number, hand out a reward card — is the one lever no report can pull for it.
 */
export function KnownBuyersCard({ known, actionLabel, onAction }: KnownBuyersCardProps) {
  const tone = TONE_COLORS[known.tone];
  return (
    <View style={styles.card}>
      <Text style={styles.headline}>{known.headline}</Text>
      <View
        style={[styles.track, { backgroundColor: tone.ground }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: known.percent }}
      >
        <View style={[styles.fill, { width: `${Math.max(known.percent, 2)}%`, backgroundColor: tone.fill }]} />
      </View>
      <Text style={styles.advice}>{known.advice}</Text>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          tone="secondary"
          size="sm"
          fullWidth={false}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  headline: { ...typography.heading, color: colors.textPrimary },
  track: { height: 8, borderRadius: radius.full, overflow: "hidden", marginTop: spacing.md },
  fill: { height: "100%", borderRadius: radius.full },
  advice: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, lineHeight: 19 },
  action: { alignSelf: "flex-start", marginTop: spacing.md },
});
