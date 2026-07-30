import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, radius, shadow, spacing } from "../theme/colors";
import { formatPeso, formatCount } from "../lib/format";
import { formatPercent } from "../lib/analytics-utils";
import type { StoreKpiTotals } from "../lib/branch-kpis";
import { Sparkline } from "./Sparkline";

/**
 * What the whole business took, before any of it is broken down.
 *
 * Dark, full-bleed and alone at the top: the one number an owner opens the app
 * for should not have to compete with a branch card for attention. Everything
 * below it is an explanation of this figure, and because it is summed from the
 * same rows those cards render, it can never disagree with them.
 */

interface StoreHeroCardProps {
  totals: StoreKpiTotals;
  /** e.g. "30 days" — states the window the figure covers. */
  periodLabel: string;
  branchCount: number;
}

export function StoreHeroCard({ totals, periodLabel, branchCount }: StoreHeroCardProps) {
  const delta = totals.revenueDelta;
  const isUp = delta !== null && delta >= 0;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Your business · {periodLabel}</Text>

      <View style={styles.headline}>
        <Text style={styles.revenue}>{formatPeso(totals.revenue, 0)}</Text>
        {delta === null ? (
          <Text style={styles.deltaMuted}>no prior period</Text>
        ) : (
          <Text style={[styles.delta, { color: isUp ? colors.successLight : colors.dangerLight }]}>
            {isUp ? "▲" : "▼"} {formatPercent(Math.abs(delta) * 100)} vs previous {periodLabel}
          </Text>
        )}
      </View>

      <Sparkline
        values={totals.dailyRevenue}
        color={colors.accent}
        height={44}
        highlightLast
        style={styles.sparkline}
      />

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Text style={styles.footerValue}>{formatCount(totals.orderCount)}</Text>
          <Text style={styles.footerLabel}>Orders</Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={styles.footerValue}>{formatPeso(totals.averageOrderValue, 0)}</Text>
          <Text style={styles.footerLabel}>Avg ticket</Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={styles.footerValue}>{formatCount(branchCount)}</Text>
          <Text style={styles.footerLabel}>{branchCount === 1 ? "Branch" : "Branches"}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.md,
  },
  eyebrow: { ...typography.eyebrow, color: colors.textTertiary },
  headline: { marginTop: spacing.sm },
  revenue: { fontSize: 34, fontWeight: "800", color: colors.textOnDark, letterSpacing: -0.5 },
  delta: { ...typography.caption, fontWeight: "700", marginTop: 4 },
  deltaMuted: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  sparkline: { marginTop: spacing.lg },
  footer: {
    flexDirection: "row",
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  footerItem: { flex: 1 },
  footerValue: { ...typography.heading, color: colors.textOnDark },
  footerLabel: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
});
