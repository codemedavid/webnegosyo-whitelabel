import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { formatPeso, formatCount } from "../lib/format";
import { formatPercent } from "../lib/analytics-utils";

interface HeroRevenueCardProps {
  revenue: number;
  orderCount: number;
  avgOrder: number;
  periodLabel: string;
  isLive?: boolean;
  /**
   * Change against the comparison period as a fraction (0.12 = up 12%).
   * `null` when there is nothing to compare against; omit to draw no delta.
   */
  delta?: number | null;
  /** Names the comparison, e.g. "yesterday". */
  comparisonLabel?: string;
}

/**
 * The one number the merchant opens the app for, alone on a dark card, with
 * the change against the comparison period beside it the way a balance card
 * shows the day's movement. Everything else on Home explains this figure.
 */
export function HeroRevenueCard({
  revenue,
  orderCount,
  avgOrder,
  periodLabel,
  isLive = false,
  delta,
  comparisonLabel = "yesterday",
}: HeroRevenueCardProps) {
  const hasDelta = delta !== undefined;
  const isUp = typeof delta === "number" && delta >= 0;
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>Revenue · {periodLabel}</Text>
        {isLive && (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        )}
      </View>

      <Text style={styles.revenue} numberOfLines={1} adjustsFontSizeToFit>
        {formatPeso(revenue, 0)}
      </Text>

      {hasDelta ? (
        delta === null ? (
          <Text style={styles.deltaMuted}>Nothing to compare with {comparisonLabel}</Text>
        ) : (
          <View style={styles.deltaRow}>
            <View style={[styles.deltaPill, isUp ? styles.deltaPillUp : styles.deltaPillDown]}>
              <Text style={[styles.deltaText, isUp ? styles.deltaTextUp : styles.deltaTextDown]}>
                {isUp ? "▲" : "▼"} {formatPercent(Math.abs(delta) * 100)}
              </Text>
            </View>
            <Text style={styles.deltaMuted}>vs {comparisonLabel}</Text>
          </View>
        )
      ) : null}

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatCount(orderCount)}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={styles.statSeparator} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatPeso(avgOrder, 0)}</Text>
          <Text style={styles.statLabel}>Avg order</Text>
        </View>
      </View>
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
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { ...typography.small, color: colors.heroInkMuted, fontWeight: "700" },
  revenue: { fontSize: 40, fontWeight: "800", color: colors.heroInkText, marginTop: spacing.sm },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  deltaPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  deltaPillUp: { backgroundColor: colors.successLight },
  deltaPillDown: { backgroundColor: colors.dangerLight },
  deltaText: { ...typography.small, fontWeight: "800" },
  deltaTextUp: { color: colors.success },
  deltaTextDown: { color: colors.danger },
  deltaMuted: { ...typography.small, color: colors.heroInkMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.heroInkElevated, marginVertical: spacing.lg },
  statsRow: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1 },
  statSeparator: { width: 1, height: 32, backgroundColor: colors.heroInkElevated },
  statValue: { ...typography.title, fontSize: 20, color: colors.heroInkText },
  statLabel: {
    ...typography.small,
    color: colors.heroInkMuted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
