import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { formatPeso, formatPesoCompact, formatCount } from "../../lib/format";
import { formatPercent, buildTrendSeries, type TrendPoint } from "../../lib/analytics-utils";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

const getTrendsRef = "analytics:getTrends" as unknown as FunctionReference<"query">;
const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;
const getPaymentMethodAnalyticsRef = "analytics:getPaymentMethodAnalytics" as unknown as FunctionReference<"query">;

interface DailyStat {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

interface SalesAnalytics {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  avgOrderValue: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  cancellationRate: number;
  ordersBySource: { web: number; mobile: number };
  ordersByStatus: Record<string, number>;
  revenueGrowth: number;
}

interface PaymentMethodAnalytics {
  methods: { method: string; count: number; revenue: number; percentage: number; avgOrderValue: number }[];
  dailyBreakdown: { date: string; methods: Record<string, number> }[];
}

const SCREEN_WIDTH = Dimensions.get("window").width;

function BarChart({ series, color, label, isMoney }: {
  series: TrendPoint[];
  color: string;
  label: string;
  isMoney: boolean;
}) {
  if (series.length === 0) return null;

  const maxVal = Math.max(...series.map((p) => p.value), 1);
  // Past ~10 bars the chart no longer fits the screen width, so switch to a
  // fixed-width scrollable strip with legible bars/labels instead of cramming.
  const scroll = series.length > 10;
  const barWidth = scroll ? 24 : Math.max(((SCREEN_WIDTH - 100) / series.length) - 6, 14);

  const bars = (
    <View style={[styles.barsContainer, scroll && styles.barsContainerScroll]}>
      {series.map((point) => {
        const height = point.value > 0 ? Math.max((point.value / maxVal) * 100, 4) : 0;
        return (
          <View key={point.label} style={[styles.barWrapper, { width: barWidth + 8 }]}>
            <Text style={styles.barValue} numberOfLines={1}>
              {isMoney ? formatPesoCompact(point.value) : formatCount(point.value)}
            </Text>
            <View style={[styles.bar, { height, backgroundColor: color, width: barWidth }]} />
            <Text style={styles.barLabel}>{point.label}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <Card title={label} style={styles.chartCard}>
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {bars}
        </ScrollView>
      ) : (
        bars
      )}
    </Card>
  );
}

// Editorial stacked-bar palette: charcoal / coral / amber / taupe, with a
// light taupe fallback for any extra methods.
const STACK_PALETTE = [colors.primary, colors.accent, colors.warning, colors.textSecondary];
const STACK_FALLBACK = colors.textTertiary;

function StackedBarChart({ data, label }: {
  data: { date: string; methods: Record<string, number> }[];
  label: string;
}) {
  if (data.length === 0) return null;

  // Get all unique methods
  const allMethods = new Set<string>();
  for (const day of data) {
    for (const method of Object.keys(day.methods)) {
      allMethods.add(method);
    }
  }
  const methods = Array.from(allMethods);
  const colorFor = (method: string) => {
    const index = methods.indexOf(method);
    return index >= 0 && index < STACK_PALETTE.length ? STACK_PALETTE[index] : STACK_FALLBACK;
  };

  const maxTotal = Math.max(
    ...data.map((d) => Object.values(d.methods).reduce((s, v) => s + v, 0)),
    1
  );
  const barWidth = Math.max(((SCREEN_WIDTH - 100) / data.length) - 4, 6);

  return (
    <Card title={label} style={styles.chartCard}>
      {/* Legend */}
      <View style={stackStyles.legend}>
        {methods.map((m) => (
          <View key={m} style={stackStyles.legendItem}>
            <View style={[stackStyles.legendDot, { backgroundColor: colorFor(m) }]} />
            <Text style={stackStyles.legendText}>{m}</Text>
          </View>
        ))}
      </View>
      <View style={styles.barsContainer}>
        {data.map((d) => {
          const total = Object.values(d.methods).reduce((s, v) => s + v, 0);
          const height = (total / maxTotal) * 100;
          return (
            <View key={d.date} style={styles.barWrapper}>
              <View style={[{ height, width: barWidth, borderRadius: 3, overflow: "hidden" }]}>
                {methods.map((m) => {
                  const val = d.methods[m] ?? 0;
                  const segmentHeight = total > 0 ? (val / total) * height : 0;
                  return (
                    <View
                      key={m}
                      style={{
                        height: segmentHeight,
                        backgroundColor: colorFor(m),
                      }}
                    />
                  );
                })}
              </View>
              <Text style={styles.barLabel}>{d.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const stackStyles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...typography.small, color: colors.textSecondary },
});

export default function TrendsScreen() {
  const [daysBack, setDaysBack] = useState(14);
  const { data: trends, isLoading, error, isMissingFunction: trendsMissing } = useSafeQuery<DailyStat[]>(getTrendsRef, { daysBack });
  const { data: salesAnalytics, error: salesError, isMissingFunction: salesMissing } = useSafeQuery<SalesAnalytics>(getSalesAnalyticsRef, { daysBack });
  const { data: paymentAnalytics, error: paymentError, isMissingFunction: paymentMissing } = useSafeQuery<PaymentMethodAnalytics>(getPaymentMethodAnalyticsRef, { daysBack });

  const anyMissing = trendsMissing || salesMissing || paymentMissing;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const revenueSeries = buildTrendSeries(trends, "totalRevenue");
  const ordersSeries = buildTrendSeries(trends, "totalOrders");
  const aovSeries = buildTrendSeries(trends, "avgOrderValue");

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Trends</Text>
        <WorkspaceSwitcher />
      </View>

      <View style={styles.periodRow}>
        {[7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.periodPill, daysBack === d && styles.periodPillActive]}
            onPress={() => setDaysBack(d)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, daysBack === d && styles.periodTextActive]}>{d} days</Text>
          </TouchableOpacity>
        ))}
      </View>

      {anyMissing && (
        <View style={bannerStyles.banner}>
          <Text style={bannerStyles.text}>
            Some reports need a backend update. Ask support to redeploy this store, then pull to refresh.
          </Text>
        </View>
      )}

      {/* Daily trend charts — computed live from orders, so they react to
          cancellations and show today immediately. */}
      {isLoading ? (
        <LoadingState message="Loading trends..." />
      ) : error && !trendsMissing ? (
        <ErrorState message={error} />
      ) : (trends ?? []).length === 0 ? (
        <EmptyState message="No orders in this period yet." />
      ) : (
        <>
          <Text style={styles.eyebrow}>Overview</Text>
          <View style={styles.summaryRow}>
            <StatCard value={(trends ?? []).reduce((s, d) => s + d.totalOrders, 0)} label="Total Orders" />
            <StatCard value={formatPeso((trends ?? []).reduce((s, d) => s + d.totalRevenue, 0))} label="Total Revenue" />
          </View>

          <Text style={styles.eyebrow}>Daily Trends</Text>
          <BarChart series={revenueSeries} color={colors.accent} label="Daily Revenue" isMoney />
          <BarChart series={ordersSeries} color={colors.primary} label="Daily Orders" isMoney={false} />
          <BarChart series={aovSeries} color={colors.warning} label="Avg Order Value" isMoney />
        </>
      )}

      {/* Live cards below render independently of the trend series so they
          never disappear just because there are no daily bars yet. */}
      {!salesError && salesAnalytics && (
        <>
          <Text style={styles.eyebrow}>Order Sources</Text>
          <Card title="Orders by Source" style={styles.chartCard}>
            <View style={sourceStyles.container}>
              <View style={sourceStyles.barRow}>
                <Text style={sourceStyles.label}>Web</Text>
                <View style={sourceStyles.barTrack}>
                  <View style={[sourceStyles.barFill, {
                    width: `${salesAnalytics.totalOrders > 0 ? (salesAnalytics.ordersBySource.web / salesAnalytics.totalOrders) * 100 : 0}%`,
                    backgroundColor: colors.primary,
                  }]} />
                </View>
                <Text style={sourceStyles.value}>{salesAnalytics.ordersBySource.web}</Text>
              </View>
              <View style={sourceStyles.barRow}>
                <Text style={sourceStyles.label}>App</Text>
                <View style={sourceStyles.barTrack}>
                  <View style={[sourceStyles.barFill, {
                    width: `${salesAnalytics.totalOrders > 0 ? (salesAnalytics.ordersBySource.mobile / salesAnalytics.totalOrders) * 100 : 0}%`,
                    backgroundColor: colors.accent,
                  }]} />
                </View>
                <Text style={sourceStyles.value}>{salesAnalytics.ordersBySource.mobile}</Text>
              </View>
            </View>
          </Card>
        </>
      )}

      {/* Payment Trends — hidden if query not deployed */}
      {!paymentError && paymentAnalytics && paymentAnalytics.dailyBreakdown.length > 0 && (
        <>
          <Text style={styles.eyebrow}>Payments</Text>
          <StackedBarChart data={paymentAnalytics.dailyBreakdown} label="Payment Trends" />
        </>
      )}

      {/* Cancellation Summary — hidden if query not deployed */}
      {!salesError && salesAnalytics && salesAnalytics.cancelledOrders > 0 && (
        <>
          <Text style={styles.eyebrow}>Cancellations</Text>
          <Card style={cancelStyles.card}>
            <View style={cancelStyles.row}>
              <View style={cancelStyles.metric}>
                <Text style={cancelStyles.value}>{salesAnalytics.cancelledOrders}</Text>
                <Text style={cancelStyles.label}>Cancelled</Text>
              </View>
              <View style={cancelStyles.metric}>
                <Text style={cancelStyles.value}>{formatPeso(salesAnalytics.cancelledRevenue)}</Text>
                <Text style={cancelStyles.label}>Lost Revenue</Text>
              </View>
              <View style={cancelStyles.metric}>
                <Text style={[cancelStyles.value, { color: colors.danger }]}>
                  {formatPercent(salesAnalytics.cancellationRate * 100)}
                </Text>
                <Text style={cancelStyles.label}>Cancel Rate</Text>
              </View>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  title: { ...typography.title, color: colors.textPrimary },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
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
  summaryRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  chartCard: { marginBottom: spacing.lg },
  barsContainer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 3, height: 140, paddingTop: spacing.sm },
  barsContainerScroll: { justifyContent: "flex-start" },
  barWrapper: { alignItems: "center" },
  bar: { borderRadius: 3, minHeight: 2 },
  barValue: { fontSize: 9, color: colors.textTertiary, marginBottom: 3, textAlign: "center" },
  barLabel: { fontSize: 9, color: colors.textTertiary, marginTop: 3, textAlign: "center" },
});

const bannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  text: { ...typography.caption, color: colors.statusPending.text },
});

const sourceStyles = StyleSheet.create({
  container: { gap: spacing.md },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "500", width: 32 },
  barTrack: { flex: 1, height: 20, backgroundColor: colors.surfaceSubtle, borderRadius: 4 },
  barFill: { height: 20, borderRadius: 4 },
  value: { ...typography.body, color: colors.textPrimary, fontWeight: "600", width: 36, textAlign: "right" },
});

const cancelStyles = StyleSheet.create({
  card: { backgroundColor: colors.dangerLight, marginBottom: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-around" },
  metric: { alignItems: "center" },
  value: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
