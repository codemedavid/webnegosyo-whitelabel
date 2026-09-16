// Profit / fast-mover / revenue-concentration insights for the Products screen.
// Presentational only: all math lives in lib/profit-analytics.ts (unit-tested),
// this component just shapes the tested output into cards. Mirrors StatCard /
// GrowthCoachCard styling. Fed the same `merged` rows as the product list.

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  computeProfitSummary,
  computeRevenueConcentration,
  rankByVelocity,
  rankByMargin,
  type ProductRow,
} from "../lib/profit-analytics";
import { formatPeso, formatCount } from "../lib/format";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";

interface ProfitInsightsProps {
  rows: readonly ProductRow[];
  /** How many items to show in the fast-mover and top-margin lists. */
  topCount?: number;
}

const DEFAULT_TOP_COUNT = 5;

/** One decimal, no trailing ".0". */
function num1(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** One-decimal percentage, no trailing ".0". */
function pct(value: number): string {
  return `${num1(value)}%`;
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

export function ProfitInsights({ rows, topCount = DEFAULT_TOP_COUNT }: ProfitInsightsProps) {
  const summary = useMemo(() => computeProfitSummary(rows), [rows]);
  const concentration = useMemo(() => computeRevenueConcentration(rows), [rows]);
  const fastMovers = useMemo(() => rankByVelocity(rows, topCount), [rows, topCount]);
  const topMargin = useMemo(() => rankByMargin(rows, topCount), [rows, topCount]);

  const hasSales = concentration.totalRevenue > 0;

  return (
    <View>
      {/* ---- Profit summary ---- */}
      <SectionTitle title="Profit" hint="Based on the cost prices you've entered" />
      {summary.weightedMarginPercent === undefined ? (
        <View style={styles.promptCard}>
          <Text style={styles.promptText}>
            Add cost prices to your items to unlock profit and margin insights. Tap any product
            below to set its cost.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.tilesRow}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Profit</Text>
              <Text style={[styles.tileValue, { color: colors.success }]}>
                {formatPeso(summary.totalProfit, 0)}
              </Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Cost</Text>
              <Text style={styles.tileValue}>{formatPeso(summary.totalCost, 0)}</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Margin</Text>
              <Text style={styles.tileValue}>{pct(summary.weightedMarginPercent)}</Text>
            </View>
          </View>
          {summary.itemsMissingCost > 0 ? (
            <Text style={styles.nag}>
              {summary.itemsMissingCost} selling{" "}
              {summary.itemsMissingCost === 1 ? "item has" : "items have"} no cost yet — add{" "}
              {summary.itemsMissingCost === 1 ? "it" : "them"} for complete profit.
            </Text>
          ) : null}
        </>
      )}

      {/* ---- Revenue concentration (Pareto) ---- */}
      <SectionTitle title="Revenue concentration" hint="Which items your revenue depends on" />
      {!hasSales ? (
        <View style={styles.promptCard}>
          <Text style={styles.promptText}>Not enough sales data yet.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.headline}>{concentration.headline}</Text>
          {concentration.itemsForThreshold > 0 ? (
            <Text style={styles.subHeadline}>
              {pct(concentration.paretoThreshold)} of revenue comes from just{" "}
              {concentration.itemsForThreshold}{" "}
              {concentration.itemsForThreshold === 1 ? "item" : "items"}.
            </Text>
          ) : null}
          <View style={styles.concList}>
            {concentration.items.slice(0, topCount).map((item, index) => (
              <View key={item.menuItemId} style={styles.concRow}>
                <Text style={styles.concRank}>#{index + 1}</Text>
                <View style={styles.concBody}>
                  <View style={styles.concLabelRow}>
                    <Text style={styles.concName} numberOfLines={1}>
                      {item.menuItemName ?? "Unnamed item"}
                    </Text>
                    <Text style={styles.concShare}>{pct(item.revenueShare)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.max(item.revenueShare, 2)}%` }]} />
                  </View>
                  <Text style={styles.concMeta}>
                    {formatPeso(item.totalRevenue, 0)} · {pct(item.cumulativeShare)} cumulative
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ---- Fast movers ---- */}
      <SectionTitle title="Fast movers" hint="Your highest-velocity items" />
      {fastMovers.length === 0 ? (
        <View style={styles.promptCard}>
          <Text style={styles.promptText}>No sales in this period yet.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {fastMovers.map((item, index) => (
            <View key={item.menuItemId} style={styles.listRow}>
              <Text style={styles.listRank}>#{index + 1}</Text>
              <Text style={styles.listName} numberOfLines={1}>
                {item.menuItemName ?? "Unnamed item"}
              </Text>
              <View style={styles.listMetric}>
                <Text style={styles.listMetricStrong}>{num1(item.avgDailyUnits)}/day</Text>
                <Text style={styles.listMetricSub}>{formatCount(item.totalUnitsSold)} sold</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ---- Highest margin ---- */}
      <SectionTitle title="Highest margin" hint="Where each sale keeps the most" />
      {topMargin.length === 0 ? (
        <View style={styles.promptCard}>
          <Text style={styles.promptText}>
            Add cost prices to see which items earn you the most per sale.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {topMargin.map((item, index) => (
            <View key={item.menuItemId} style={styles.listRow}>
              <Text style={styles.listRank}>#{index + 1}</Text>
              <Text style={styles.listName} numberOfLines={1}>
                {item.menuItemName ?? "Unnamed item"}
              </Text>
              <View style={styles.listMetric}>
                <Text style={[styles.listMetricStrong, { color: colors.success }]}>
                  {pct(item.marginPercent ?? 0)}
                </Text>
                <Text style={styles.listMetricSub}>{formatPeso(item.totalRevenue, 0)} rev</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  sectionHint: { ...typography.small, color: colors.textTertiary, marginTop: 2 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow.sm,
  },
  promptCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
  },
  promptText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },

  tilesRow: { flexDirection: "row", gap: spacing.sm },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  tileLabel: { ...typography.eyebrow, color: colors.textSecondary },
  tileValue: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.xs, fontWeight: "800" },
  nag: { ...typography.small, color: colors.textTertiary, marginTop: spacing.sm },

  headline: { ...typography.heading, color: colors.textPrimary, fontWeight: "800" },
  subHeadline: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  concList: { marginTop: spacing.md, gap: spacing.md },
  concRow: { flexDirection: "row", gap: spacing.sm },
  concRank: { ...typography.caption, color: colors.textTertiary, fontWeight: "700", width: 28, marginTop: 2 },
  concBody: { flex: 1 },
  concLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  concName: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1, marginRight: spacing.sm },
  concShare: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  concMeta: { ...typography.small, color: colors.textTertiary, marginTop: 4 },

  barTrack: { height: 5, backgroundColor: colors.surfaceSubtle, borderRadius: 3, marginTop: spacing.sm },
  barFill: { height: 5, backgroundColor: colors.accent, borderRadius: 3 },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  listRank: { ...typography.caption, color: colors.textTertiary, fontWeight: "700", width: 28 },
  listName: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  listMetric: { alignItems: "flex-end" },
  listMetricStrong: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  listMetricSub: { ...typography.small, color: colors.textTertiary, marginTop: 1 },
});
