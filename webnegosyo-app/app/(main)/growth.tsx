// Growth tab — the scaling scorecard. Answers three questions at a glance
// (revenue = customers × ticket size, kept by margin): do we lack customers,
// do customers spend too little, or do we keep too little of each sale?
// All math lives in lib/growth-metrics.ts; this screen only renders it.
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { formatPeso, formatPesoCompact, formatCount } from "../../lib/format";
import { formatPercent } from "../../lib/analytics-utils";
import {
  computeGrowthSummary,
  bucketByWeek,
  bucketByMonth,
  diagnoseGrowth,
  computeScaleTarget,
  weightedMarginPercent,
  DEFAULT_BENCHMARKS,
  type GrowthBottleneck,
  type PeriodBucket,
} from "../../lib/growth-metrics";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";

const getTrendsRef = "analytics:getTrends" as unknown as FunctionReference<"query">;
const getCustomerInsightsRef = "analytics:getCustomerInsights" as unknown as FunctionReference<"query">;
const getProductAnalyticsRef = "productAnalytics:getAll" as unknown as FunctionReference<"query">;

interface DailyStat {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

interface CustomerInsights {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  returnRate: number;
}

interface ProductAnalyticsRow {
  totalRevenue: number;
  marginPercent?: number;
}

const PERIOD_OPTIONS = [30, 60, 90] as const;
const TARGET_MULTIPLIERS = [1.5, 2, 3] as const;

// Visual identity per bottleneck: tint + strong color for the verdict card.
const BOTTLENECK_STYLE: Record<GrowthBottleneck, { bg: string; fg: string; glyph: string }> = {
  "no-data": { bg: colors.infoLight, fg: colors.info, glyph: "◌" },
  customers: { bg: colors.warningLight, fg: colors.statusPending.text, glyph: "◎" },
  aov: { bg: colors.accentLight, fg: colors.statusPreparing.text, glyph: "◈" },
  margin: { bg: colors.dangerLight, fg: colors.statusCancelled.text, glyph: "◐" },
  healthy: { bg: colors.successLight, fg: colors.statusReady.text, glyph: "●" },
};

/** One lever of the growth engine: label, value, and pass/fail vs benchmark. */
function LeverRow({ name, value, benchmark, isPassing, isBottleneck, isUnknown }: {
  name: string;
  value: string;
  benchmark: string;
  isPassing: boolean;
  isBottleneck: boolean;
  isUnknown?: boolean;
}) {
  const dotColor = isUnknown
    ? colors.textTertiary
    : isPassing
      ? colors.success
      : colors.warning;
  return (
    <View style={[leverStyles.row, isBottleneck && leverStyles.rowBottleneck]}>
      <View style={[leverStyles.dot, { backgroundColor: dotColor }]} />
      <View style={leverStyles.textBlock}>
        <Text style={leverStyles.name}>{name}</Text>
        <Text style={leverStyles.benchmark}>{benchmark}</Text>
      </View>
      <Text style={leverStyles.value}>{value}</Text>
      {isBottleneck && <Text style={leverStyles.flag}>FIX THIS</Text>}
    </View>
  );
}

const leverStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  rowBottleneck: { backgroundColor: colors.surfaceSubtle },
  dot: { width: 10, height: 10, borderRadius: 5 },
  textBlock: { flex: 1 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  benchmark: { ...typography.small, color: colors.textTertiary, marginTop: 1 },
  value: { ...typography.heading, color: colors.textPrimary },
  flag: {
    ...typography.small,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.accent,
  },
});

/** Compact bar strip for weekly/monthly revenue buckets. */
function PaceChart({ buckets, color }: { buckets: PeriodBucket[]; color: string }) {
  if (buckets.length === 0) return null;
  const maxRevenue = Math.max(...buckets.map((b) => b.revenue), 1);
  return (
    <View style={paceStyles.container}>
      {buckets.map((bucket) => {
        const height = bucket.revenue > 0
          ? Math.max((bucket.revenue / maxRevenue) * 90, 4)
          : 0;
        return (
          <View key={bucket.label} style={paceStyles.barWrapper}>
            <Text style={paceStyles.barValue} numberOfLines={1}>
              {formatPesoCompact(bucket.revenue)}
            </Text>
            <View style={[paceStyles.bar, { height, backgroundColor: color }]} />
            <Text style={paceStyles.barLabel} numberOfLines={1}>{bucket.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const paceStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-evenly",
    height: 130,
    paddingTop: spacing.sm,
  },
  barWrapper: { alignItems: "center", flex: 1, maxWidth: 56 },
  bar: { borderRadius: 3, minHeight: 2, alignSelf: "stretch", marginHorizontal: 6 },
  barValue: { fontSize: 9, color: colors.textTertiary, marginBottom: 3 },
  barLabel: { fontSize: 9, color: colors.textTertiary, marginTop: 3 },
});

export default function GrowthScreen() {
  const [daysBack, setDaysBack] = useState<number>(30);
  const [multiplier, setMultiplier] = useState<number>(2);

  const { data: trends, isLoading, error, isMissingFunction: trendsMissing } =
    useSafeQuery<DailyStat[]>(getTrendsRef, { daysBack });
  const { data: customers, isMissingFunction: customersMissing } =
    useSafeQuery<CustomerInsights>(getCustomerInsightsRef, { daysBack });
  const { data: productRows } =
    useSafeQuery<ProductAnalyticsRow[]>(getProductAnalyticsRef, { period: "30d" });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const summary = computeGrowthSummary(trends ?? [], {
    periodDays: daysBack,
    totalCustomers: customers?.totalCustomers,
  });
  const marginPercent = weightedMarginPercent(productRows);
  const diagnosis = diagnoseGrowth(
    {
      avgOrdersPerDay: summary.avgOrdersPerDay,
      avgOrderValue: summary.avgOrderValue,
      totalOrders: summary.totalOrders,
      marginPercent,
    },
  );
  const verdictStyle = BOTTLENECK_STYLE[diagnosis.bottleneck];

  const weeks = bucketByWeek(trends);
  const months = bucketByMonth(trends);

  const targetMonthlyRevenue = summary.avgRevenuePerMonth * multiplier;
  const scaleTarget = computeScaleTarget({
    targetMonthlyRevenue,
    avgOrderValue: summary.avgOrderValue,
    avgOrdersPerDay: summary.avgOrdersPerDay,
  });

  const hasData = (trends ?? []).length > 0 && summary.totalOrders > 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={styles.title}>Growth</Text>
      <Text style={styles.subtitle}>Your scaling scorecard</Text>

      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.periodPill, daysBack === d && styles.periodPillActive]}
            onPress={() => setDaysBack(d)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, daysBack === d && styles.periodTextActive]}>
              {d} days
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {(trendsMissing || customersMissing) && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Some reports need a backend update. Ask support to redeploy this store, then pull to refresh.
          </Text>
        </View>
      )}

      {isLoading ? (
        <LoadingState message="Crunching your growth numbers..." />
      ) : error && !trendsMissing ? (
        <ErrorState message={error} />
      ) : !hasData ? (
        <EmptyState message="No orders in this period yet. Your growth scorecard starts with the first sale." />
      ) : (
        <>
          {/* Hero — monthly revenue pace on the dark ink surface */}
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>Monthly revenue pace</Text>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(summary.avgRevenuePerMonth, 0)}
            </Text>
            <Text style={styles.heroCaption}>
              Based on the last {daysBack} days · {summary.activeDays} selling day{summary.activeDays === 1 ? "" : "s"}
            </Text>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{summary.avgOrdersPerDay.toFixed(1)}</Text>
                <Text style={styles.heroStatLabel}>Orders / day</Text>
              </View>
              <View style={styles.heroStatSeparator} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{formatPeso(summary.avgOrderValue, 0)}</Text>
                <Text style={styles.heroStatLabel}>Per order</Text>
              </View>
              <View style={styles.heroStatSeparator} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {summary.revenuePerCustomer !== undefined
                    ? formatPeso(summary.revenuePerCustomer, 0)
                    : "—"}
                </Text>
                <Text style={styles.heroStatLabel}>Per customer</Text>
              </View>
            </View>
          </View>

          {/* Growth engine — the three levers, bottleneck flagged */}
          <Text style={styles.eyebrow}>Growth engine</Text>
          <Card style={styles.sectionCard}>
            <Text style={styles.equation}>
              Revenue = Customers × Ticket size, kept by Margin
            </Text>
            <LeverRow
              name="Customers"
              value={`${summary.avgOrdersPerDay.toFixed(1)}/day`}
              benchmark={`Healthy: ${DEFAULT_BENCHMARKS.minOrdersPerDay}+ orders a day`}
              isPassing={summary.avgOrdersPerDay >= DEFAULT_BENCHMARKS.minOrdersPerDay}
              isBottleneck={diagnosis.bottleneck === "customers"}
            />
            <LeverRow
              name="Ticket size"
              value={formatPeso(summary.avgOrderValue, 0)}
              benchmark={`Healthy: ${formatPeso(DEFAULT_BENCHMARKS.minAov, 0)}+ per order`}
              isPassing={summary.avgOrderValue >= DEFAULT_BENCHMARKS.minAov}
              isBottleneck={diagnosis.bottleneck === "aov"}
            />
            <LeverRow
              name="Margin"
              value={marginPercent !== undefined ? formatPercent(marginPercent) : "Add costs"}
              benchmark={
                marginPercent !== undefined
                  ? `Healthy: ${DEFAULT_BENCHMARKS.minMarginPercent}%+ kept per sale`
                  : "Set product costs in Products to unlock"
              }
              isPassing={(marginPercent ?? 0) >= DEFAULT_BENCHMARKS.minMarginPercent}
              isBottleneck={diagnosis.bottleneck === "margin"}
              isUnknown={marginPercent === undefined}
            />
            <View style={[styles.verdict, { backgroundColor: verdictStyle.bg }]}>
              <Text style={[styles.verdictTitle, { color: verdictStyle.fg }]}>
                {verdictStyle.glyph}  {diagnosis.title}
              </Text>
              <Text style={[styles.verdictAdvice, { color: verdictStyle.fg }]}>
                {diagnosis.advice}
              </Text>
            </View>
          </Card>

          {/* Averages — day / week / month at a glance */}
          <Text style={styles.eyebrow}>Your averages</Text>
          <View style={styles.statRow}>
            <StatCard value={formatPeso(summary.avgRevenuePerDay, 0)} label="Revenue / day" />
            <StatCard value={formatPeso(summary.avgRevenuePerWeek, 0)} label="Revenue / week" />
          </View>
          <View style={styles.statRow}>
            <StatCard value={formatPeso(summary.avgRevenuePerMonth, 0)} label="Revenue / month" />
            <StatCard
              value={`${formatPesoCompact(summary.avgOrderValue)} : 1`}
              label="Revenue : orders"
              hint={`${formatCount(summary.totalOrders)} orders · ${formatPeso(summary.totalRevenue, 0)}`}
            />
          </View>
          {customers && (
            <View style={styles.statRow}>
              <StatCard
                value={formatCount(customers.totalCustomers)}
                label="Customers"
                hint={`${formatPercent(customers.returnRate * 100)} come back`}
              />
              <StatCard
                value={
                  summary.revenuePerCustomer !== undefined
                    ? formatPeso(summary.revenuePerCustomer, 0)
                    : "—"
                }
                label="Revenue / customer"
              />
            </View>
          )}

          {/* Revenue rhythm — weekly always, monthly once it spans months */}
          <Text style={styles.eyebrow}>Revenue rhythm</Text>
          <Card title="By week" style={styles.sectionCard}>
            <PaceChart buckets={weeks.slice(-8)} color={colors.accent} />
          </Card>
          {months.length > 1 && (
            <Card title="By month" style={styles.sectionCard}>
              <PaceChart buckets={months} color={colors.primary} />
            </Card>
          )}

          {/* Scale planner — what it takes to multiply the current pace */}
          <Text style={styles.eyebrow}>Scale planner</Text>
          <Card style={styles.sectionCard}>
            <Text style={styles.plannerLead}>If you want to grow your monthly revenue…</Text>
            <View style={styles.multiplierRow}>
              {TARGET_MULTIPLIERS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.multiplierPill, multiplier === m && styles.multiplierPillActive]}
                  onPress={() => setMultiplier(m)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.multiplierText, multiplier === m && styles.multiplierTextActive]}
                  >
                    {m}×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.plannerTarget}>
              Target: {formatPeso(targetMonthlyRevenue, 0)}/month
            </Text>
            <View style={styles.pathRow}>
              <View style={styles.pathCard}>
                <Text style={styles.pathEyebrow}>Path 1 · More customers</Text>
                <Text style={styles.pathValue}>+{formatCount(scaleTarget.additionalOrdersPerDay)}</Text>
                <Text style={styles.pathCaption}>
                  extra orders a day ({formatCount(scaleTarget.ordersNeededPerDay)}/day total)
                </Text>
              </View>
              <View style={styles.pathCard}>
                <Text style={styles.pathEyebrow}>Path 2 · Bigger tickets</Text>
                <Text style={styles.pathValue}>
                  {formatPeso(scaleTarget.aovNeededAtCurrentVolume, 0)}
                </Text>
                <Text style={styles.pathCaption}>
                  per order at today&apos;s volume (now {formatPeso(summary.avgOrderValue, 0)})
                </Text>
              </View>
            </View>
            <Text style={styles.plannerFootnote}>
              Mix both: upsells and bundles raise the ticket while promos bring the orders.
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60, paddingBottom: spacing.xxl },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary, marginBottom: spacing.sm },
  periodRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  periodPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  periodPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  periodTextActive: { color: colors.textOnDark },
  banner: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerText: { ...typography.caption, color: colors.statusPending.text },

  hero: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    ...shadow.md,
  },
  heroEyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroValue: { fontSize: 40, fontWeight: "800", color: colors.heroInkText, marginTop: spacing.sm },
  heroCaption: { ...typography.small, color: colors.heroInkMuted, marginTop: spacing.xs },
  heroDivider: { height: 1, backgroundColor: colors.heroInkElevated, marginVertical: spacing.lg },
  heroStatsRow: { flexDirection: "row", alignItems: "center" },
  heroStat: { flex: 1 },
  heroStatSeparator: { width: 1, height: 32, backgroundColor: colors.heroInkElevated, marginHorizontal: spacing.md },
  heroStatValue: { ...typography.heading, fontSize: 18, color: colors.heroInkText },
  heroStatLabel: {
    ...typography.small,
    color: colors.heroInkMuted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  sectionCard: { marginBottom: spacing.xl },
  equation: {
    ...typography.small,
    color: colors.textTertiary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  verdict: { borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  verdictTitle: { ...typography.heading, fontSize: 15 },
  verdictAdvice: { ...typography.caption, marginTop: spacing.xs, lineHeight: 19 },

  statRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },

  plannerLead: { ...typography.body, color: colors.textSecondary },
  multiplierRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  multiplierPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  multiplierPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  multiplierText: { ...typography.heading, color: colors.textSecondary },
  multiplierTextActive: { color: colors.textOnDark },
  plannerTarget: {
    ...typography.heading,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  pathRow: { flexDirection: "row", gap: spacing.md },
  pathCard: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  pathEyebrow: { ...typography.small, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.4 },
  pathValue: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, marginTop: spacing.sm },
  pathCaption: { ...typography.small, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
  plannerFootnote: { ...typography.small, color: colors.textTertiary, marginTop: spacing.lg },
});
