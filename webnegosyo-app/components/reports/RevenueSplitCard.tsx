import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatCount, formatPeso } from "../../lib/format";
import {
  changeRatio,
  revenueSegments,
  type DashboardWindow,
  type RevenueSegmentKey,
} from "../../lib/customer-hub/dashboard";
import { DeltaPill, formatShare } from "../performance/parts";

/** Regulars carry the brand colour: they are the money the store wants more of. */
export const SEGMENT_COLORS: Record<RevenueSegmentKey, string> = {
  returning: colors.accent,
  new: colors.warning,
  unknown: "rgba(253,251,247,0.28)",
};

interface RevenueSplitCardProps {
  window: DashboardWindow;
  tillComplete: boolean;
  periodLabel: string;
}

/**
 * The dashboard's first answer: how much came in, and from whom. One number,
 * its change, and one bar that splits it into regulars, first-timers and
 * orders nobody named, with the amounts spelled out under it so nobody has to
 * estimate a slice by eye.
 */
export function RevenueSplitCard({ window, tillComplete, periodLabel }: RevenueSplitCardProps) {
  const segments = revenueSegments(window, tillComplete);
  const change = changeRatio(window.revenue.total, window.previousRevenue);

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.eyebrow}>Sales · {periodLabel}</Text>
      <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
        {formatPeso(window.revenue.total, 0)}
      </Text>
      <View style={styles.metaRow}>
        <DeltaPill change={change} onDark />
        <Text style={styles.meta}>
          vs the {window.days} days before · {formatCount(window.orders)} orders
        </Text>
      </View>

      {segments.length > 0 ? (
        <>
          <View style={styles.bar} accessibilityElementsHidden>
            {segments.map((segment) => (
              <View
                key={segment.key}
                style={{ flex: segment.share, backgroundColor: SEGMENT_COLORS[segment.key] }}
              />
            ))}
          </View>
          <View style={styles.legend}>
            {segments.map((segment) => (
              <View
                key={segment.key}
                style={styles.legendRow}
                accessible
                accessibilityLabel={`${segment.label}: ${formatPeso(segment.amount, 0)}, ${formatShare(segment.share)}`}
              >
                <View style={[styles.dot, { backgroundColor: SEGMENT_COLORS[segment.key] }]} />
                <Text style={styles.legendLabel}>{segment.label}</Text>
                <Text style={styles.legendAmount}>{formatPeso(segment.amount, 0)}</Text>
                <Text style={styles.legendShare}>{formatShare(segment.share)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.empty}>No completed sales in this period yet.</Text>
      )}

      {!tillComplete && segments.length > 0 ? (
        <Text style={styles.footnote}>Split counts orders with a customer name or number only.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.md,
  },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  total: { fontSize: 40, fontWeight: "800", color: colors.heroInkText, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  meta: { ...typography.small, color: colors.heroInkMuted, flexShrink: 1 },
  bar: {
    flexDirection: "row",
    height: 12,
    borderRadius: radius.full,
    overflow: "hidden",
    marginTop: spacing.xl,
    gap: 2,
  },
  legend: { marginTop: spacing.md, gap: spacing.sm },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { ...typography.caption, color: colors.heroInkText, flex: 1 },
  legendAmount: { ...typography.caption, color: colors.heroInkText, fontWeight: "700" },
  legendShare: {
    ...typography.caption,
    color: colors.heroInkMuted,
    width: 40,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  empty: { ...typography.caption, color: colors.heroInkMuted, marginTop: spacing.lg },
  footnote: { ...typography.small, color: colors.heroInkMuted, marginTop: spacing.md },
});
