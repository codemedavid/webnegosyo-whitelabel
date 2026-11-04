import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatClock } from "../../lib/cash/service-periods";
import { colors, radius, spacing, typography } from "../../theme/colors";

const MINUTES_PER_DAY = 24 * 60;
/** The sample late sale on the band: 1:30 AM, the hour night stores ask about. */
const SAMPLE_SALE_MINUTES = 90;

/**
 * One business day as a band, cutoff to cutoff: Friday shaded, midnight marked
 * inside it, and a sample 1:30 AM sale shown on the side it counts toward.
 * Decoration only — the sentence under it says the same thing in words.
 */
export function CutoffPreview({ cutoffMinutes }: { cutoffMinutes: number }) {
  const short = formatClock(cutoffMinutes).replace(":00", "");
  const midnightShare = cutoffMinutes === 0 ? null : (MINUTES_PER_DAY - cutoffMinutes) / MINUTES_PER_DAY;
  const saleCountsAsFriday = cutoffMinutes > SAMPLE_SALE_MINUTES;
  const saleShare = (MINUTES_PER_DAY - cutoffMinutes + SAMPLE_SALE_MINUTES) / MINUTES_PER_DAY;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel={`Friday runs from Friday ${short} to Saturday ${short}.`}
    >
      <View style={styles.band}>
        <Text style={styles.bandLabel}>FRIDAY</Text>
        {midnightShare !== null ? (
          <View style={[styles.midnight, { left: `${midnightShare * 100}%` }]}>
            <Text style={styles.midnightLabel}>12 MN</Text>
          </View>
        ) : null}
        {saleCountsAsFriday ? <View style={[styles.sale, { left: `${saleShare * 100}%` }]} /> : null}
      </View>
      <View style={styles.ends}>
        <Text style={styles.end}>Fri {short}</Text>
        <Text style={styles.end}>Sat {short}</Text>
      </View>
      <Text style={styles.saleLine}>
        {saleCountsAsFriday ? "A 1:30 AM sale counts as Friday." : "A 1:30 AM sale counts as Saturday."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, paddingTop: spacing.md },
  band: {
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accentLight,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  bandLabel: { ...typography.small, fontWeight: "800", letterSpacing: 1, color: colors.statusPreparing.text },
  midnight: {
    position: "absolute",
    top: -10,
    bottom: -4,
    width: 0,
    borderLeftWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.textTertiary,
    alignItems: "center",
  },
  midnightLabel: {
    ...typography.small,
    color: colors.textMuted,
    position: "absolute",
    top: -14,
    width: 40,
    textAlign: "center",
    left: -20,
  },
  sale: {
    position: "absolute",
    bottom: 6,
    width: 10,
    height: 10,
    marginLeft: -5,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  ends: { flexDirection: "row", justifyContent: "space-between" },
  end: { ...typography.small, color: colors.textMuted },
  saleLine: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});
