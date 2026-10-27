import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { PRIME_COST_BAND, type ProfitReport } from "../../lib/profit/profit-model";
import { formatRatio } from "../../lib/profit/profit-view";
import { colors, radius, spacing } from "../../theme/colors";
import { profitCard } from "./profit-styles";

const clampPercent = (ratio: number): number => Math.min(Math.max(ratio, 0), 1) * 100;

/** Food + staff (prime cost) against the band most restaurants land in. */
export function FoodStaffBar({ report }: { report: ProfitReport }) {
  const prime = report.ratios.prime;
  if (prime === null) return null;
  // Rounded: 0.55 * 100 is 55.00000000000001 in floating point.
  const low = Math.round(PRIME_COST_BAND.low * 100);
  const high = Math.round(PRIME_COST_BAND.high * 100);
  return (
    <View style={profitCard.card}>
      <Text style={profitCard.title}>Food + staff: {formatRatio(prime)} of sales</Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Food and staff together: ${formatRatio(prime)} of sales. Most restaurants land at ${low} to ${high} percent.`}
      >
        <View style={[styles.band, { left: `${low}%`, width: `${high - low}%` }]} />
        <View style={[styles.fill, { width: `${clampPercent(prime)}%` }]} />
      </View>
      <Text style={profitCard.hint}>
        Most restaurants land at {low}–{high}%. The shaded part is that range; above it, profit gets thin.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    overflow: "hidden",
    marginTop: spacing.xs,
  },
  band: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.successLight },
  fill: { position: "absolute", left: 0, top: 3, bottom: 3, borderRadius: radius.full, backgroundColor: colors.primary },
});
