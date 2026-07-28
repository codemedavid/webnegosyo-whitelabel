import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { formatPeso, formatCount } from "../lib/format";
import { classifyGrowth } from "../lib/analytics-utils";
import { formatDayLabel } from "../lib/product-analytics-filters";
import type {
  ProductDayGroup,
  ProductDelta,
  ProductMetric,
} from "../lib/product-daily-analytics";

/**
 * Presentational day-by-day product breakdown.
 *
 * Receives everything already computed by `buildProductAnalytics` — it makes no
 * ranking, filtering, or date decisions of its own, so the numbers on screen
 * are exactly the ones under unit test.
 */
interface DailyProductBreakdownProps {
  days: readonly ProductDayGroup[];
  /** Window-wide per-product totals joined against the previous window. */
  deltas: readonly ProductDelta[];
  metric: ProductMetric;
  todayKey: string;
}

const METRIC_LABEL: Record<ProductMetric, string> = {
  sales: "sales",
  units: "units",
  orders: "orders",
};

/** Value the day's bar chart is scaled against, per the active metric. */
function metricValue(row: { units: number; orders: number; sales: number }, metric: ProductMetric) {
  return row[metric];
}

function DeltaBadge({ delta }: { delta: ProductDelta | undefined }) {
  if (!delta) return null;
  if (delta.isNew) {
    return (
      <View style={[styles.deltaBadge, { backgroundColor: colors.infoLight }]}>
        <Text style={[styles.deltaText, { color: colors.info }]}>New</Text>
      </View>
    );
  }

  const growth = classifyGrowth(delta.salesChangePercent);
  const tone =
    growth.direction === "up"
      ? { bg: colors.successLight, fg: colors.success }
      : growth.direction === "down"
        ? { bg: colors.dangerLight, fg: colors.danger }
        : { bg: colors.surfaceSubtle, fg: colors.textSecondary };

  return (
    <View style={[styles.deltaBadge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.deltaText, { color: tone.fg }]}>{growth.label}</Text>
    </View>
  );
}

export function DailyProductBreakdown({
  days,
  deltas,
  metric,
  todayKey,
}: DailyProductBreakdownProps) {
  const deltaById = new Map(deltas.map((d) => [d.menuItemId, d]));

  return (
    <View>
      {days.map((day) => {
        const top = day.rows[0];
        const max = top ? metricValue(top, metric) || 1 : 1;

        return (
          <View key={day.date} style={styles.daySection}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>{formatDayLabel(day.date, todayKey)}</Text>
              <Text style={styles.dayTotals}>
                {formatPeso(day.totalSales)} · {formatCount(day.totalOrders)} orders ·{" "}
                {formatCount(day.totalUnits)} units
              </Text>
            </View>

            {day.rows.map((row, index) => {
              const value = metricValue(row, metric);
              const barPct = Math.max((value / max) * 100, value > 0 ? 4 : 0);
              return (
                <View
                  key={row.menuItemId}
                  style={styles.row}
                  accessibilityLabel={`${row.menuItemName}, ${formatCount(row.units)} units, ${formatCount(row.orders)} orders, ${formatPeso(row.sales)} sales`}
                >
                  <View style={styles.rowHeader}>
                    <Text style={styles.rank}>#{index + 1}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {row.menuItemName}
                    </Text>
                    <DeltaBadge delta={deltaById.get(row.menuItemId)} />
                  </View>

                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${barPct}%` }]} />
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaStrong}>{formatPeso(row.sales)}</Text>
                    <Text style={styles.metaText}>
                      {formatCount(row.units)} units · {formatCount(row.orders)} orders
                    </Text>
                  </View>
                </View>
              );
            })}

            {day.truncatedCount > 0 && (
              <Text style={styles.truncated}>
                +{formatCount(day.truncatedCount)} more product
                {day.truncatedCount === 1 ? "" : "s"} this day — raise the limit to see
                {" "}{METRIC_LABEL[metric]} for all of them.
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  daySection: { marginBottom: spacing.lg },
  dayHeader: { marginBottom: spacing.sm },
  dayTitle: { ...typography.heading, color: colors.textPrimary },
  dayTotals: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rank: { ...typography.caption, color: colors.textTertiary, fontWeight: "700", width: 28 },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  deltaBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  deltaText: { fontSize: 10, fontWeight: "700" },
  barTrack: {
    height: 5,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 3,
    marginTop: spacing.sm,
  },
  barFill: { height: 5, backgroundColor: colors.accent, borderRadius: 3 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  metaStrong: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  metaText: { ...typography.caption, color: colors.textSecondary },
  truncated: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xs,
  },
});
