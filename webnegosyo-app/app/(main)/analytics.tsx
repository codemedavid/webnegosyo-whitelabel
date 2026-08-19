import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { formatPeso } from "../../lib/format";
import {
  formatPercent,
  classifyGrowth,
  withShares,
  buildFunnelSteps,
  describePeakHour,
  type GrowthBadge,
} from "../../lib/analytics-utils";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { ExportSheet } from "../../components/ExportSheet";
import { runAnalyticsExport } from "../../lib/export/run-export";

const getUpsellAnalyticsRef = "analytics:getUpsellAnalytics" as unknown as FunctionReference<"query">;
const getBundleAnalyticsRef = "analytics:getBundleAnalytics" as unknown as FunctionReference<"query">;
const getTopItemsRef = "analytics:getTopItems" as unknown as FunctionReference<"query">;
const getRevenueBreakdownRef = "analytics:getRevenueBreakdown" as unknown as FunctionReference<"query">;
const getUpsellTrendsRef = "analytics:getUpsellTrends" as unknown as FunctionReference<"query">;
const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;
const getCustomerInsightsRef = "analytics:getCustomerInsights" as unknown as FunctionReference<"query">;
const getOrderHeatmapRef = "analytics:getOrderHeatmap" as unknown as FunctionReference<"query">;
const getPaymentMethodAnalyticsRef = "analytics:getPaymentMethodAnalytics" as unknown as FunctionReference<"query">;

interface UpsellStats { shown: number; clicked: number; converted: number; clickRate: number; conversionRate: number; }
interface BundleStats { viewed: number; added: number; conversionRate: number; }
interface TopItem { itemId: string; name: string; count: number; revenue: number; }
interface RevenueBreakdown {
  byOrderType: { type: string; revenue: number; count: number }[];
  byPaymentMethod: { method: string; revenue: number; count: number }[];
}
interface UpsellTrends {
  dailyRates: { date: string; rate: number }[];
  totalUpsellRevenue: number;
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

interface OrderHeatmap {
  heatmap: { day: number; hour: number; count: number }[];
  peakHour: { day: number; hour: number; count: number };
  quietHour: { day: number; hour: number; count: number };
}

interface CustomerInsights {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  returnRate: number;
  avgOrdersPerCustomer: number;
  avgRevenuePerCustomer: number;
  topCustomers: { name: string; contact: string; orderCount: number; totalSpent: number; lastOrderDate: number }[];
}

// Editorial palette for hand-rolled charts: charcoal ink leads, coral
// highlights, amber secondary, taupe for the tail.
const BAR_COLORS = [colors.primary, colors.accent, colors.warning, colors.textSecondary, colors.textTertiary, colors.info];

const FUNNEL_COLORS = [colors.primary, colors.warning, colors.accent];

export default function AnalyticsScreen() {
  const [daysBack, setDaysBack] = useState(7);
  const [refreshing, setRefreshing] = useState(false);
  const [isExportOpen, setExportOpen] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const { data: upsellStats, error: upsellError } = useSafeQuery<UpsellStats>(getUpsellAnalyticsRef, { daysBack });
  const { data: bundleStats, error: bundleError } = useSafeQuery<BundleStats>(getBundleAnalyticsRef, { daysBack });
  const { data: topItems, error: topItemsError } = useSafeQuery<TopItem[]>(getTopItemsRef, { daysBack, limit: 10 });
  const { data: revenueBreakdown, error: revenueError } = useSafeQuery<RevenueBreakdown>(getRevenueBreakdownRef, { daysBack });
  const { data: upsellTrends, error: trendsError } = useSafeQuery<UpsellTrends>(getUpsellTrendsRef, { daysBack });
  const { data: salesAnalytics, error: salesError, isMissingFunction: salesMissing } = useSafeQuery<SalesAnalytics>(getSalesAnalyticsRef, { daysBack });
  const { data: paymentAnalytics, error: paymentError, isMissingFunction: paymentMissing } = useSafeQuery<PaymentMethodAnalytics>(getPaymentMethodAnalyticsRef, { daysBack });
  const { data: heatmapData, error: heatmapError, isMissingFunction: heatmapMissing } = useSafeQuery<OrderHeatmap>(getOrderHeatmapRef, { daysBack });
  const { data: customerInsights, error: customerError, isMissingFunction: customerMissing } = useSafeQuery<CustomerInsights>(getCustomerInsightsRef, { daysBack });

  // Only include existing query errors in the global error banner.
  // New analytics queries degrade gracefully (sections hide when not deployed).
  const error = upsellError || bundleError || topItemsError || revenueError || trendsError;

  // When a section is empty because the tenant's Convex deployment predates that
  // function (stale bundle), tell the merchant instead of silently hiding it.
  const anyMissing = salesMissing || paymentMissing || heatmapMissing || customerMissing;

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await runAnalyticsExport({
        daysBack,
        nowMs: Date.now(),
        sales: salesAnalytics,
        revenueBreakdown,
        paymentAnalytics,
        heatmap: heatmapData,
        customerInsights,
        upsellStats,
        upsellTrends,
        bundleStats,
        topItems,
      });
      setExportOpen(false);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Analytics</Text>
        <View style={styles.titleActions}>
          <WorkspaceSwitcher />
          <TouchableOpacity
            onPress={() => {
              setExportError(null);
              setExportOpen(true);
            }}
            style={styles.exportButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Export analytics report as CSV"
          >
            <Text style={styles.exportButtonText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ExportSheet
        visible={isExportOpen}
        title={`Export analytics (last ${daysBack} days)`}
        isBusy={isExporting}
        errorMessage={exportError}
        showPresets={false}
        onExport={handleExport}
        onClose={() => setExportOpen(false)}
      />

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

      {error && <ErrorState message={error} />}

      {anyMissing && (
        <View style={styles.missingBanner}>
          <Text style={styles.missingBannerText}>
            Some reports need a backend update. Ask support to redeploy this store, then pull to refresh.
          </Text>
        </View>
      )}

      {/* ——— Sales overview: KPI strip ——— */}
      {!salesError && (
        <View style={styles.section}>
          <Eyebrow label="Sales Overview" />
          {!salesAnalytics ? (
            <Card><LoadingState /></Card>
          ) : salesAnalytics.totalOrders === 0 ? (
            <Card><EmptyState message="No sales in this period yet" /></Card>
          ) : (
            <>
              <RevenueHeroCard
                revenue={salesAnalytics.totalRevenue}
                growth={classifyGrowth(salesAnalytics.revenueGrowth * 100)}
              />
              <View style={styles.kpiGrid}>
                <KpiCard value={String(salesAnalytics.totalOrders)} label="Orders" />
                <KpiCard value={formatPeso(salesAnalytics.avgOrderValue, 0)} label="Avg Order Value" />
              </View>
              <View style={styles.kpiGrid}>
                <KpiCard value={String(salesAnalytics.cancelledOrders)} label="Cancelled" />
                <KpiCard
                  value={formatPercent(salesAnalytics.cancellationRate * 100)}
                  label="Cancel Rate"
                  accentValue={salesAnalytics.cancellationRate > 0}
                />
              </View>
              <Card style={styles.subCard}>
                <View style={styles.sourceRow}>
                  <View style={styles.sourceItem}>
                    <Text style={styles.sourceValue}>{salesAnalytics.ordersBySource.web}</Text>
                    <Text style={styles.sourceLabel}>Web orders</Text>
                  </View>
                  <View style={styles.sourceDivider} />
                  <View style={styles.sourceItem}>
                    <Text style={styles.sourceValue}>{salesAnalytics.ordersBySource.mobile}</Text>
                    <Text style={styles.sourceLabel}>Mobile orders</Text>
                  </View>
                </View>
              </Card>
            </>
          )}
        </View>
      )}

      {/* ——— Breakdowns ——— */}
      <View style={styles.section}>
        <Eyebrow label="Breakdowns" />
        <Card title="Revenue by Order Type" style={styles.subCard}>
          {!revenueBreakdown ? (
            <LoadingState />
          ) : revenueBreakdown.byOrderType.length === 0 ? (
            <EmptyState message="No data yet" />
          ) : (
            <BreakdownBars
              items={revenueBreakdown.byOrderType.map((item) => ({
                label: item.type,
                value: item.revenue,
                count: item.count,
              }))}
            />
          )}
        </Card>

        <Card title="Revenue by Payment Method" style={styles.subCard}>
          {!revenueBreakdown ? (
            <LoadingState />
          ) : revenueBreakdown.byPaymentMethod.length === 0 ? (
            <EmptyState message="No data yet" />
          ) : (
            <BreakdownBars
              items={revenueBreakdown.byPaymentMethod.map((item) => ({
                label: item.method,
                value: item.revenue,
                count: item.count,
              }))}
            />
          )}
        </Card>

        {!paymentError && (
          <Card title="Payment Method Detail" style={styles.subCard}>
            {!paymentAnalytics ? (
              <LoadingState />
            ) : paymentAnalytics.methods.length === 0 ? (
              <EmptyState message="No payment data yet" />
            ) : (
              paymentAnalytics.methods.map((m, i) => {
                const maxRevenue = paymentAnalytics.methods[0]?.revenue ?? 1;
                const barWidthPct = Math.max((m.revenue / maxRevenue) * 100, 8);
                const color = BAR_COLORS[i % BAR_COLORS.length];
                return (
                  <View key={m.method} style={styles.paymentRow}>
                    <View style={styles.paymentHeader}>
                      <View style={[styles.paymentDot, { backgroundColor: color }]} />
                      <Text style={styles.paymentLabel}>{m.method}</Text>
                      <Text style={styles.paymentPct}>{formatPercent(m.percentage * 100)}</Text>
                    </View>
                    <View style={barStyles.track}>
                      <View style={[barStyles.fill, { width: `${barWidthPct}%`, backgroundColor: color }]} />
                    </View>
                    <View style={styles.paymentMeta}>
                      <Text style={styles.paymentMetaText}>
                        {formatPeso(m.revenue, 0)} · {m.count} orders · avg {formatPeso(m.avgOrderValue, 0)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        )}
      </View>

      {/* ——— Peak hours ——— */}
      {!heatmapError && (
        <View style={styles.section}>
          <Eyebrow label="Peak Hours" />
          <Card style={styles.subCard}>
            {!heatmapData ? (
              <LoadingState />
            ) : (
              <>
                <Text style={styles.peakSummary}>
                  Busiest: <Text style={styles.peakSummaryStrong}>{describePeakHour(heatmapData.peakHour)}</Text>
                  {"  ·  "}
                  Quietest: <Text style={styles.peakSummaryStrong}>{describePeakHour(heatmapData.quietHour)}</Text>
                </Text>
                <HeatmapGrid
                  heatmap={heatmapData.heatmap}
                  peakHour={heatmapData.peakHour}
                  quietHour={heatmapData.quietHour}
                />
              </>
            )}
          </Card>
        </View>
      )}

      {/* ——— Customers ——— */}
      {!customerError && (
        <View style={styles.section}>
          <Eyebrow label="Customers" />
          <Card style={styles.subCard}>
            {!customerInsights ? (
              <LoadingState />
            ) : (
              <>
                <View style={styles.customerStatsRow}>
                  <View style={styles.customerStat}>
                    <Text style={styles.customerStatValue}>{customerInsights.totalCustomers}</Text>
                    <Text style={styles.customerStatLabel}>Customers</Text>
                  </View>
                  <View style={styles.customerStat}>
                    <Text style={styles.customerStatValue}>{customerInsights.avgOrdersPerCustomer.toFixed(1)}</Text>
                    <Text style={styles.customerStatLabel}>Avg Orders</Text>
                  </View>
                  <View style={styles.customerStat}>
                    <Text style={styles.customerStatValue}>{formatPeso(customerInsights.avgRevenuePerCustomer, 0)}</Text>
                    <Text style={styles.customerStatLabel}>Avg Spend</Text>
                  </View>
                </View>

                <NewVsReturningBar
                  newCount={customerInsights.newCustomers}
                  returningCount={customerInsights.returningCustomers}
                  returnRate={customerInsights.returnRate}
                />

                {customerInsights.topCustomers.length > 0 && (
                  <View style={styles.topCustomersBlock}>
                    <Text style={styles.blockLabel}>Top Customers</Text>
                    {customerInsights.topCustomers.map((c, i) => (
                      <View key={i} style={styles.customerRow}>
                        <RankMedallion rank={i + 1} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.customerName}>{c.name}</Text>
                          <Text style={styles.customerMeta}>
                            {c.orderCount} orders · {formatPeso(c.totalSpent, 0)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </Card>
        </View>
      )}

      {/* ——— Upsell funnel ——— */}
      <View style={styles.section}>
        <Eyebrow label="Upsell Funnel" />
        <Card style={styles.subCard}>
          {!upsellStats ? (
            <LoadingState />
          ) : (
            <>
              {upsellTrends && (
                <View style={styles.upsellHeadline}>
                  <Text style={styles.headlineValue}>{formatPeso(upsellTrends.totalUpsellRevenue, 0)}</Text>
                  <Text style={styles.headlineLabel}>Upsell Revenue</Text>
                </View>
              )}
              <FunnelBars
                stages={[
                  { label: "Shown", value: upsellStats.shown },
                  { label: "Clicked", value: upsellStats.clicked },
                  { label: "Converted", value: upsellStats.converted },
                ]}
              />
              <View style={styles.rateRow}>
                <View style={styles.rateItem}>
                  <Text style={styles.rateValue}>{formatPercent(upsellStats.clickRate * 100)}</Text>
                  <Text style={styles.rateLabel}>Click Rate</Text>
                </View>
                <View style={styles.rateItem}>
                  <Text style={styles.rateValue}>{formatPercent(upsellStats.conversionRate * 100)}</Text>
                  <Text style={styles.rateLabel}>Conversion</Text>
                </View>
              </View>

              {/* Daily Conversion Trend */}
              {upsellTrends && upsellTrends.dailyRates.length > 0 && (
                <View style={styles.trendSection}>
                  <Text style={styles.blockLabel}>Daily Conversion Rate</Text>
                  <View style={styles.sparkContainer}>
                    {upsellTrends.dailyRates.map((day) => {
                      const maxRate = Math.max(...upsellTrends.dailyRates.map((d) => d.rate), 0.01);
                      const barHeight = Math.max((day.rate / maxRate) * 40, 2);
                      return (
                        <View key={day.date} style={styles.sparkBarWrapper}>
                          <View style={[styles.sparkBar, { height: barHeight }]} />
                          <Text style={styles.sparkLabel}>
                            {new Date(day.date + "T00:00:00").toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit" })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </>
          )}
        </Card>
      </View>

      {/* ——— Bundles ——— */}
      <View style={styles.section}>
        <Eyebrow label="Bundles" />
        <Card style={styles.subCard}>
          {!bundleStats ? (
            <LoadingState />
          ) : (
            <>
              <FunnelBars
                stages={[
                  { label: "Viewed", value: bundleStats.viewed },
                  { label: "Added", value: bundleStats.added },
                ]}
              />
              <View style={styles.rateRow}>
                <View style={styles.rateItem}>
                  <Text style={styles.rateValue}>{formatPercent(bundleStats.conversionRate * 100)}</Text>
                  <Text style={styles.rateLabel}>Conversion Rate</Text>
                </View>
              </View>
            </>
          )}
        </Card>
      </View>

      {/* ——— Top items ——— */}
      <View style={styles.section}>
        <Eyebrow label="Top Items" />
        <Card style={styles.subCard}>
          {!topItems ? (
            <LoadingState />
          ) : topItems.length === 0 ? (
            <EmptyState message="No data yet" />
          ) : (
            topItems.map((item, index) => {
              const maxRevenue = topItems[0]?.revenue ?? 1;
              const barWidthPct = Math.max((item.revenue / maxRevenue) * 100, 5);

              return (
                <View key={item.itemId} style={styles.topItemRow}>
                  <RankMedallion rank={index + 1} />
                  <View style={styles.topItemInfo}>
                    <View style={styles.topItemHeader}>
                      <Text style={styles.topItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.topItemRevenue}>{formatPeso(item.revenue, 0)}</Text>
                    </View>
                    <View style={styles.topBarTrack}>
                      <View style={[styles.topBarFill, { width: `${barWidthPct}%` }]} />
                    </View>
                    <Text style={styles.topItemMeta}>{item.count} sold</Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

// ————— Local presentational pieces —————

function Eyebrow({ label }: { label: string }) {
  return <Text style={styles.eyebrow}>{label}</Text>;
}

function RevenueHeroCard({ revenue, growth }: { revenue: number; growth: GrowthBadge }) {
  const badgeColor =
    growth.direction === "up" ? colors.accent
    : growth.direction === "down" ? colors.danger
    : "rgba(255,255,255,0.2)";
  const arrow = growth.direction === "up" ? "↑ " : growth.direction === "down" ? "↓ " : "";
  return (
    <View style={heroStyles.card}>
      <Text style={heroStyles.eyebrow}>Revenue</Text>
      <View style={heroStyles.row}>
        <Text style={heroStyles.value}>{formatPeso(revenue, 0)}</Text>
        <View style={[heroStyles.badge, { backgroundColor: badgeColor }]}>
          <Text style={heroStyles.badgeText}>{arrow}{growth.label}</Text>
        </View>
      </View>
      <Text style={heroStyles.caption}>vs previous period</Text>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginBottom: spacing.sm,
    ...shadow.md,
  },
  eyebrow: { ...typography.eyebrow, color: "rgba(255,255,255,0.6)", marginBottom: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  value: { fontSize: 34, fontWeight: "800", color: colors.textOnDark, letterSpacing: -0.5 },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: { ...typography.small, color: colors.textOnDark, fontWeight: "700" },
  caption: { ...typography.small, color: "rgba(255,255,255,0.5)", marginTop: spacing.xs },
});

function KpiCard({ value, label, accentValue }: { value: string; label: string; accentValue?: boolean }) {
  return (
    <View style={kpiStyles.card}>
      <Text style={[kpiStyles.value, accentValue && { color: colors.accent }]}>{value}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow.sm,
  },
  value: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  label: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xs },
});

function RankMedallion({ rank }: { rank: number }) {
  return (
    <View style={medallionStyles.circle}>
      <Text style={medallionStyles.text}>{rank}</Text>
    </View>
  );
}

const medallionStyles = StyleSheet.create({
  circle: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 11, fontWeight: "700", color: colors.textOnDark },
});

function NewVsReturningBar({ newCount, returningCount, returnRate }: {
  newCount: number;
  returningCount: number;
  returnRate: number;
}) {
  const total = newCount + returningCount;
  const returningPct = total > 0 ? (returningCount / total) * 100 : 0;
  const newPct = total > 0 ? 100 - returningPct : 0;
  return (
    <View style={segmentStyles.container}>
      <View style={segmentStyles.headerRow}>
        <Text style={styles.blockLabel}>New vs Returning</Text>
        <Text style={segmentStyles.returnRate}>{formatPercent(returnRate * 100)} return rate</Text>
      </View>
      <View style={segmentStyles.track}>
        {returningPct > 0 && <View style={[segmentStyles.segment, { flex: returningPct, backgroundColor: colors.accent }]} />}
        {newPct > 0 && <View style={[segmentStyles.segment, { flex: newPct, backgroundColor: colors.warning }]} />}
        {total === 0 && <View style={[segmentStyles.segment, { flex: 1, backgroundColor: colors.separator }]} />}
      </View>
      <View style={segmentStyles.legendRow}>
        <View style={segmentStyles.legendItem}>
          <View style={[segmentStyles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={segmentStyles.legendText}>Returning · {returningCount}</Text>
        </View>
        <View style={segmentStyles.legendItem}>
          <View style={[segmentStyles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={segmentStyles.legendText}>New · {newCount}</Text>
        </View>
      </View>
    </View>
  );
}

const segmentStyles = StyleSheet.create({
  container: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  returnRate: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  track: {
    flexDirection: "row",
    height: 12,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: colors.surfaceSubtle,
  },
  segment: { height: 12 },
  legendRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...typography.small, color: colors.textSecondary },
});

// Stepped funnel bar visualization driven by buildFunnelSteps ratios.
function FunnelBars({ stages }: { stages: { label: string; value: number }[] }) {
  const steps = buildFunnelSteps(stages);

  return (
    <View style={funnelStyles.container}>
      {steps.map((step, i) => {
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
        return (
          <View key={step.label} style={funnelStyles.row}>
            <View style={funnelStyles.labelCol}>
              <Text style={funnelStyles.label}>{step.label}</Text>
            </View>
            <View style={funnelStyles.barCol}>
              <View style={funnelStyles.barTrack}>
                <View style={[funnelStyles.bar, { width: `${step.ratio * 100}%`, backgroundColor: color }]} />
              </View>
            </View>
            <Text style={funnelStyles.value}>{step.value}</Text>
          </View>
        );
      })}
    </View>
  );
}

const funnelStyles = StyleSheet.create({
  container: { gap: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  labelCol: { width: 76 },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  barCol: { flex: 1 },
  barTrack: { height: 22, borderRadius: radius.sm, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  bar: { height: 22, borderRadius: radius.sm },
  value: { ...typography.caption, color: colors.textPrimary, fontWeight: "700", width: 44, textAlign: "right" },
});

// Horizontal breakdown bars — rows sorted with % shares via withShares.
function BreakdownBars({ items }: { items: { label: string; value: number; count: number }[] }) {
  const countByLabel = new Map(items.map((item) => [item.label, item.count]));
  const rows = withShares(items.map(({ label, value }) => ({ label, value })));
  const maxValue = rows[0]?.value || 1;

  return (
    <View style={barStyles.container}>
      {rows.map((row, i) => {
        const widthPct = Math.max((row.value / maxValue) * 100, 8);
        const color = BAR_COLORS[i % BAR_COLORS.length];
        return (
          <View key={row.label} style={barStyles.row}>
            <View style={barStyles.header}>
              <View style={[barStyles.dot, { backgroundColor: color }]} />
              <Text style={barStyles.label} numberOfLines={1}>{row.label}</Text>
              <Text style={barStyles.value}>{formatPeso(row.value, 0)} ({formatPercent(row.share)})</Text>
            </View>
            <View style={barStyles.track}>
              <View style={[barStyles.fill, { width: `${widthPct}%`, backgroundColor: color }]} />
            </View>
            <Text style={barStyles.meta}>{countByLabel.get(row.label) ?? 0} orders</Text>
          </View>
        );
      })}
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { gap: spacing.md },
  row: {},
  header: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1 },
  value: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  track: { height: 6, backgroundColor: colors.surfaceSubtle, borderRadius: 3 },
  fill: { height: 6, borderRadius: 3 },
  meta: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
});

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
  titleActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  exportButton: {
    borderColor: colors.separator,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  exportButtonText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
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
  section: { marginBottom: spacing.xl },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary, marginBottom: spacing.sm },
  subCard: { marginBottom: spacing.sm },
  kpiGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  missingBanner: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  missingBannerText: { ...typography.caption, color: colors.statusPending.text },
  upsellHeadline: { alignItems: "center", marginBottom: spacing.md },
  headlineValue: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
  headlineLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  rateRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.separator,
  },
  rateItem: { alignItems: "center" },
  rateValue: { fontSize: 20, fontWeight: "800", color: colors.accent },
  rateLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  trendSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator },
  blockLabel: { ...typography.eyebrow, color: colors.textSecondary, marginBottom: spacing.sm },
  sparkContainer: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 56 },
  sparkBarWrapper: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  sparkBar: { width: "100%", borderRadius: 2, minWidth: 4, backgroundColor: colors.accent },
  sparkLabel: { fontSize: 8, color: colors.textTertiary, marginTop: 2 },
  peakSummary: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  peakSummaryStrong: { color: colors.textPrimary, fontWeight: "700" },
  topItemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm, gap: spacing.sm },
  topItemInfo: { flex: 1 },
  topItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topItemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1, marginRight: spacing.sm },
  topItemRevenue: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  topBarTrack: { height: 4, backgroundColor: colors.surfaceSubtle, borderRadius: 2, marginTop: spacing.xs },
  topBarFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  topItemMeta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  sourceRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  sourceItem: { flex: 1, alignItems: "center" },
  sourceValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  sourceLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  sourceDivider: { width: 1, height: 32, backgroundColor: colors.separator },
  paymentRow: { marginBottom: spacing.md },
  paymentHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 4 },
  paymentDot: { width: 8, height: 8, borderRadius: 4 },
  paymentLabel: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1 },
  paymentPct: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  paymentMeta: { marginTop: 2 },
  paymentMetaText: { ...typography.small, color: colors.textTertiary },
  customerStatsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: spacing.sm },
  customerStat: { alignItems: "center", flex: 1 },
  customerStatValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  customerStatLabel: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  topCustomersBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator },
  customerRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.sm },
  customerName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  customerMeta: { ...typography.small, color: colors.textSecondary },
});
