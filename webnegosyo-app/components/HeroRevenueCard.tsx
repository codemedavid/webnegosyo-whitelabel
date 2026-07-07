import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { formatPeso, formatCount } from "../lib/format";

interface HeroRevenueCardProps {
  revenue: number;
  orderCount: number;
  avgOrder: number;
  periodLabel: string;
  isLive?: boolean;
}

export function HeroRevenueCard({
  revenue,
  orderCount,
  avgOrder,
  periodLabel,
  isLive = false,
}: HeroRevenueCardProps) {
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
  divider: { height: 1, backgroundColor: colors.heroInkElevated, marginVertical: spacing.lg },
  statsRow: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1 },
  statSeparator: { width: 1, height: 32, backgroundColor: colors.heroInkElevated },
  statValue: { ...typography.title, fontSize: 20, color: colors.heroInkText },
  statLabel: { ...typography.small, color: colors.heroInkMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
});
