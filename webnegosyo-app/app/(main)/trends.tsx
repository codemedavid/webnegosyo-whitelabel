import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { formatPeso, formatPesoCompact, formatCount } from "../../lib/format";
import { formatPercent, buildTrendSeries, type TrendPoint } from "../../lib/analytics-utils";
import { buildOrderChannelRows } from "../../lib/order-channels";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ReportPeriodBar } from "../../components/ReportPeriodBar";
import {
  REPORT_PRESETS,
  defaultSelection,
  describeSelection,
  selectionToQueryArgs,
  type ReportSelection,
} from "../../lib/report-window";

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
  // Absent on a store whose backend predates the split; the helper then falls
  // back to the two channels above.
  ordersByChannel?: { source: string; count: number; revenue: number }[];
  ordersByStatus: Record<string, number>;
  revenueGrowth: number;
}

interface PaymentMethodAnalytics {
  methods: { method: string; count: number; revenue: number; percentage: number; avgOrderValue: number }[];
  dailyBreakdown: { date: string; methods: Record<string, number> }[];
}

/**
 * Chrome around the bars - card padding and the value gutter - subtracted from
 * the window before the remainder is divided between them.
 */
const CHART_CHROME = 100;

function BarChart({ series, color, label, isMoney }: {
  series: TrendPoint[];
  color: string;
  label: string;
  isMoney: boolean;
}) {
  // The LIVE width, not a module-scope `Dimensions.get`: a tablet turned
  // sideways has half again the space these bars had, and a width frozen at
  // import would leave the chart drawn for the orientation the app opened in.
  const { width } = useWindowDimensions();

  if (series.length === 0) return null;

  const maxVal = Math.max(...series.map((p) => p.value), 1);
  // Past ~10 bars the chart no longer fits the screen width, so switch to a
  // fixed-width scrollable strip with legible bars/labels instead of cramming.
  const scroll = series.length > 10;
  const barWidth = scroll ? 24 : Math.max(((width - CHART_CHROME) / series.length) - 6, 14);

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
  const { width } = useWindowDimensions();

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
  const barWidth = Math.max(((width - CHART_CHROME) / data.length) - 4, 6);

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
  // One selection drives every query on this screen. `windowArgs` is spread
  // into each: a preset still sends `daysBack` alone, so a store on an older
  // Convex bundle is unaffected until the merchant picks actual dates.
  const [selection, setSelection] = useState<ReportSelection>(() => defaultSelection(14));
  const [nowMs] = useState(() => Date.now());
  const windowArgs = useMemo(() => selectionToQueryArgs(selection, nowMs), [selection, nowMs]);
  const periodLabel = describeSelection(selection, nowMs);
  const { data: trends, isLoading, error, isMissingFunction: trendsMissing, refetch: refetchTrends } = useSafeQuery<DailyStat[]>(getTrendsRef, { ...windowArgs });
  const { data: salesAnalytics, error: salesError, isMissingFunction: salesMissing, refetch: refetchSales } = useSafeQuery<SalesAnalytics>(getSalesAnalyticsRef, { ...windowArgs });
  const { data: paymentAnalytics, error: paymentError, isMissingFunction: paymentMissing, refetch: refetchPayments } = useSafeQuery<PaymentMethodAnalytics>(getPaymentMethodAnalyticsRef, { ...windowArgs });

  const anyMissing = trendsMissing || salesMissing || paymentMissing;

  const [refreshing, setRefreshing] = useState(false);

  // One bar per channel the store actually took orders through, so a register
  // sale is visible here rather than only inside the total.
  const channelRows = useMemo(
    () =>
      salesAnalytics
        ? buildOrderChannelRows({
            totalOrders: salesAnalytics.totalOrders,
            ordersByChannel: salesAnalytics.ordersByChannel,
            ordersBySource: salesAnalytics.ordersBySource,
          })
        : [],
    [salesAnalytics]
  );
  // Pull-to-refresh re-reads every query this screen holds.
  const onRefresh = useCallback(
    () => refreshWithMinSpinner([refetchTrends, refetchSales, refetchPayments], setRefreshing),
    [refetchTrends, refetchSales, refetchPayments]
  );

  const revenueSeries = buildTrendSeries(trends, "totalRevenue");
  const ordersSeries = buildTrendSeries(trends, "totalOrders");
  const aovSeries = buildTrendSeries(trends, "avgOrderValue");

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Trends" subtitle={periodLabel} />
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >

      <ReportPeriodBar
        selection={selection}
        presets={REPORT_PRESETS}
        nowMs={nowMs}
        onChange={setSelection}
      />

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
              {channelRows.map((row, i) => (
                <View key={row.source || "other"} style={sourceStyles.barRow}>
                  <Text style={sourceStyles.label} numberOfLines={1}>{row.label}</Text>
                  <View style={sourceStyles.barTrack}>
                    <View style={[sourceStyles.barFill, {
                      width: `${row.share * 100}%`,
                      backgroundColor: SOURCE_BAR_COLORS[i % SOURCE_BAR_COLORS.length],
                    }]} />
                  </View>
                  <Text style={sourceStyles.value}>{row.count}</Text>
                </View>
              ))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0 },
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

// One colour per channel bar, cycling if a store ever reports more than six.
const SOURCE_BAR_COLORS = [
  colors.primary,
  colors.accent,
  colors.warning,
  colors.info,
  colors.textSecondary,
  colors.textTertiary,
];

const sourceStyles = StyleSheet.create({
  container: { gap: spacing.md },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "500", width: 56 },
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
