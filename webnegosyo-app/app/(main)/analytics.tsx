import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { StatCard } from "../../components/StatCard";
import { HeatmapGrid } from "../../components/HeatmapGrid";
import { GrowthIndicator } from "../../components/GrowthIndicator";

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

const FUNNEL_COLORS = {
  shown: "#6366F1",
  clicked: "#8B5CF6",
  converted: "#10B981",
};

const BAR_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#06B6D4"];

export default function AnalyticsScreen() {
  const [daysBack, setDaysBack] = useState(7);

  const { data: upsellStats, error: upsellError } = useSafeQuery<UpsellStats>(getUpsellAnalyticsRef, { daysBack });
  const { data: bundleStats, error: bundleError } = useSafeQuery<BundleStats>(getBundleAnalyticsRef, { daysBack });
  const { data: topItems, error: topItemsError } = useSafeQuery<TopItem[]>(getTopItemsRef, { daysBack, limit: 10 });
  const { data: revenueBreakdown, error: revenueError } = useSafeQuery<RevenueBreakdown>(getRevenueBreakdownRef, { daysBack });
  const { data: upsellTrends, error: trendsError } = useSafeQuery<UpsellTrends>(getUpsellTrendsRef, { daysBack });
  const { data: salesAnalytics, error: salesError } = useSafeQuery<SalesAnalytics>(getSalesAnalyticsRef, { daysBack });
  const { data: paymentAnalytics, error: paymentError } = useSafeQuery<PaymentMethodAnalytics>(getPaymentMethodAnalyticsRef, { daysBack });
  const { data: heatmapData, error: heatmapError } = useSafeQuery<OrderHeatmap>(getOrderHeatmapRef, { daysBack });
  const { data: customerInsights, error: customerError } = useSafeQuery<CustomerInsights>(getCustomerInsightsRef, { daysBack });

  // Only include existing query errors in the global error banner.
  // New analytics queries degrade gracefully (sections hide when not deployed).
  const error = upsellError || bundleError || topItemsError || revenueError || trendsError;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Analytics</Text>

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

      {/* Sales Overview — hidden if query not deployed */}
      {!salesError && (
        <Card title="Sales Overview" style={styles.section}>
          {!salesAnalytics ? (
            <LoadingState />
          ) : (
            <>
              <View style={styles.salesHeadline}>
                <Text style={styles.headlineValue}>₱{salesAnalytics.totalRevenue.toFixed(0)}</Text>
                <GrowthIndicator value={salesAnalytics.revenueGrowth} />
              </View>
              <View style={styles.metricsRow}>
                <StatCard value={salesAnalytics.totalOrders} label="Orders" />
                <StatCard value={`₱${salesAnalytics.avgOrderValue.toFixed(0)}`} label="Avg Order" />
              </View>
              <View style={styles.metricsRow}>
                <StatCard value={salesAnalytics.cancelledOrders} label="Cancelled" />
                <StatCard value={`${(salesAnalytics.cancellationRate * 100).toFixed(1)}%`} label="Cancel Rate" />
              </View>
              <View style={[styles.sourceRow, { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator }]}>
                <View style={styles.sourceItem}>
                  <Text style={styles.sourceValue}>{salesAnalytics.ordersBySource.web}</Text>
                  <Text style={styles.sourceLabel}>Web</Text>
                </View>
                <View style={styles.sourceDivider} />
                <View style={styles.sourceItem}>
                  <Text style={styles.sourceValue}>{salesAnalytics.ordersBySource.mobile}</Text>
                  <Text style={styles.sourceLabel}>Mobile</Text>
                </View>
              </View>
            </>
          )}
        </Card>
      )}

      {/* Payment Methods — hidden if query not deployed */}
      {!paymentError && (
        <Card title="Payment Methods" style={styles.section}>
          {!paymentAnalytics ? (
            <LoadingState />
          ) : paymentAnalytics.methods.length === 0 ? (
            <EmptyState message="No payment data yet" />
          ) : (
            <>
              {paymentAnalytics.methods.map((m, i) => {
                const maxRevenue = paymentAnalytics.methods[0]?.revenue ?? 1;
                const barWidthPct = Math.max((m.revenue / maxRevenue) * 100, 8);
                const color = BAR_COLORS[i % BAR_COLORS.length];
                return (
                  <View key={m.method} style={styles.paymentRow}>
                    <View style={styles.paymentHeader}>
                      <View style={[styles.paymentDot, { backgroundColor: color }]} />
                      <Text style={styles.paymentLabel}>{m.method}</Text>
                      <Text style={styles.paymentPct}>{(m.percentage * 100).toFixed(0)}%</Text>
                    </View>
                    <View style={breakdownStyles.barTrack}>
                      <View style={[breakdownStyles.barFill, { width: `${barWidthPct}%`, backgroundColor: color }]} />
                    </View>
                    <View style={styles.paymentMeta}>
                      <Text style={styles.paymentMetaText}>₱{m.revenue.toFixed(0)} · {m.count} orders · avg ₱{m.avgOrderValue.toFixed(0)}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </Card>
      )}

      {/* Peak Hours — hidden if query not deployed */}
      {!heatmapError && (
        <Card title="Peak Hours" style={styles.section}>
          {!heatmapData ? (
            <LoadingState />
          ) : (
            <HeatmapGrid
              heatmap={heatmapData.heatmap}
              peakHour={heatmapData.peakHour}
              quietHour={heatmapData.quietHour}
            />
          )}
        </Card>
      )}

      {/* Customer Insights — hidden if query not deployed */}
      {!customerError && (
        <Card title="Customer Insights" style={styles.section}>
          {!customerInsights ? (
            <LoadingState />
          ) : (
            <>
              <View style={styles.metricsRow}>
                <StatCard value={customerInsights.totalCustomers} label="Total" />
                <StatCard value={customerInsights.newCustomers} label="New" />
                <StatCard value={customerInsights.returningCustomers} label="Returning" />
              </View>
              <View style={styles.metricsRow}>
                <StatCard value={`${(customerInsights.returnRate * 100).toFixed(0)}%`} label="Return Rate" />
                <StatCard value={customerInsights.avgOrdersPerCustomer.toFixed(1)} label="Avg Orders" />
                <StatCard value={`₱${customerInsights.avgRevenuePerCustomer.toFixed(0)}`} label="Avg Spend" />
              </View>

              {customerInsights.topCustomers.length > 0 && (
                <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator }}>
                  <Text style={styles.trendTitle}>Top Customers</Text>
                  {customerInsights.topCustomers.map((c, i) => (
                    <View key={i} style={styles.customerRow}>
                      <Text style={styles.rankText}>#{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{c.name}</Text>
                        <Text style={styles.customerMeta}>{c.orderCount} orders · ₱{c.totalSpent.toFixed(0)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </Card>
      )}

      {/* Upsell Funnel — Visual Bars */}
      <Card title="Upsell Funnel" style={styles.section}>
        {!upsellStats ? (
          <LoadingState />
        ) : (
          <>
            {upsellTrends && (
              <View style={styles.upsellHeadline}>
                <Text style={styles.headlineValue}>₱{upsellTrends.totalUpsellRevenue.toFixed(0)}</Text>
                <Text style={styles.headlineLabel}>Upsell Revenue</Text>
              </View>
            )}
            <FunnelBar
              stages={[
                { label: "Shown", value: upsellStats.shown, color: FUNNEL_COLORS.shown },
                { label: "Clicked", value: upsellStats.clicked, color: FUNNEL_COLORS.clicked },
                { label: "Converted", value: upsellStats.converted, color: FUNNEL_COLORS.converted },
              ]}
            />
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(upsellStats.clickRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Click Rate</Text>
              </View>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(upsellStats.conversionRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Conversion</Text>
              </View>
            </View>

            {/* Daily Conversion Trend */}
            {upsellTrends && upsellTrends.dailyRates.length > 0 && (
              <View style={styles.trendSection}>
                <Text style={styles.trendTitle}>Daily Conversion Rate</Text>
                <View style={styles.sparkContainer}>
                  {upsellTrends.dailyRates.map((day, i) => {
                    const maxRate = Math.max(...upsellTrends.dailyRates.map((d) => d.rate), 0.01);
                    const barHeight = Math.max((day.rate / maxRate) * 40, 2);
                    return (
                      <View key={day.date} style={styles.sparkBarWrapper}>
                        <View
                          style={[
                            styles.sparkBar,
                            { height: barHeight, backgroundColor: FUNNEL_COLORS.converted },
                          ]}
                        />
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

      {/* Bundle Performance */}
      <Card title="Bundle Performance" style={styles.section}>
        {!bundleStats ? (
          <LoadingState />
        ) : (
          <>
            <FunnelBar
              stages={[
                { label: "Viewed", value: bundleStats.viewed, color: FUNNEL_COLORS.shown },
                { label: "Added", value: bundleStats.added, color: FUNNEL_COLORS.converted },
              ]}
            />
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateValue}>{(bundleStats.conversionRate * 100).toFixed(1)}%</Text>
                <Text style={styles.rateLabel}>Conversion Rate</Text>
              </View>
            </View>
          </>
        )}
      </Card>

      {/* Revenue by Order Type */}
      <Card title="Revenue by Order Type" style={styles.section}>
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

      {/* Revenue by Payment Method */}
      <Card title="Revenue by Payment Method" style={styles.section}>
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

      {/* Top Items */}
      <Card title="Top Items by Revenue" style={styles.section}>
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
                <Text style={styles.rankText}>#{index + 1}</Text>
                <View style={styles.topItemInfo}>
                  <View style={styles.topItemHeader}>
                    <Text style={styles.topItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.topItemRevenue}>₱{item.revenue.toFixed(0)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${barWidthPct}%` }]} />
                  </View>
                  <Text style={styles.topItemMeta}>{item.count} sold</Text>
                </View>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

// Stepped funnel bar visualization
function FunnelBar({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <View style={funnelStyles.container}>
      {stages.map((stage, i) => {
        const widthPct = Math.max((stage.value / maxValue) * 100, 8);
        return (
          <View key={stage.label} style={funnelStyles.row}>
            <View style={funnelStyles.labelCol}>
              <Text style={funnelStyles.label}>{stage.label}</Text>
            </View>
            <View style={funnelStyles.barCol}>
              <View
                style={[
                  funnelStyles.bar,
                  { width: `${widthPct}%`, backgroundColor: stage.color },
                ]}
              >
                <Text style={funnelStyles.barText}>{stage.value}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const funnelStyles = StyleSheet.create({
  container: { gap: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center" },
  labelCol: { width: 80 },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  barCol: { flex: 1 },
  bar: {
    height: 28,
    borderRadius: radius.sm,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    minWidth: 40,
  },
  barText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});

// Horizontal breakdown bars
function BreakdownBars({ items }: { items: { label: string; value: number; count: number }[] }) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((sum, i) => sum + i.value, 0);

  return (
    <View style={breakdownStyles.container}>
      {items.map((item, i) => {
        const widthPct = Math.max((item.value / maxValue) * 100, 8);
        const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
        const color = BAR_COLORS[i % BAR_COLORS.length];
        return (
          <View key={item.label} style={breakdownStyles.row}>
            <View style={breakdownStyles.header}>
              <View style={[breakdownStyles.dot, { backgroundColor: color }]} />
              <Text style={breakdownStyles.label} numberOfLines={1}>{item.label}</Text>
              <Text style={breakdownStyles.value}>₱{item.value.toFixed(0)} ({pct}%)</Text>
            </View>
            <View style={breakdownStyles.barTrack}>
              <View style={[breakdownStyles.barFill, { width: `${widthPct}%`, backgroundColor: color }]} />
            </View>
            <Text style={breakdownStyles.meta}>{item.count} orders</Text>
          </View>
        );
      })}
    </View>
  );
}

const breakdownStyles = StyleSheet.create({
  container: { gap: spacing.md },
  row: {},
  header: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1 },
  value: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  barTrack: { height: 6, backgroundColor: colors.separator, borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  meta: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
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
  periodTextActive: { color: "#FFFFFF" },
  section: { marginBottom: spacing.lg },
  upsellHeadline: { alignItems: "center", marginBottom: spacing.md },
  headlineValue: { fontSize: 28, fontWeight: "700", color: colors.primary },
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
  rateValue: { fontSize: 20, fontWeight: "700", color: colors.primary },
  rateLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  trendSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator },
  trendTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", marginBottom: spacing.sm },
  sparkContainer: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 56 },
  sparkBarWrapper: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  sparkBar: { width: "100%", borderRadius: 2, minWidth: 4 },
  sparkLabel: { fontSize: 8, color: colors.textTertiary, marginTop: 2 },
  topItemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm, gap: spacing.sm },
  rankText: { ...typography.caption, color: colors.textTertiary, fontWeight: "600", width: 24 },
  topItemInfo: { flex: 1 },
  topItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topItemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1, marginRight: spacing.sm },
  topItemRevenue: { ...typography.body, color: colors.primary, fontWeight: "600" },
  barTrack: { height: 4, backgroundColor: colors.separator, borderRadius: 2, marginTop: spacing.xs },
  barFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  topItemMeta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  metricsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  salesHeadline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.md },
  sourceRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  sourceItem: { flex: 1, alignItems: "center" },
  sourceValue: { fontSize: 20, fontWeight: "700", color: colors.primary },
  sourceLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  sourceDivider: { width: 1, height: 32, backgroundColor: colors.separator },
  paymentRow: { marginBottom: spacing.md },
  paymentHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 4 },
  paymentDot: { width: 8, height: 8, borderRadius: 4 },
  paymentLabel: { ...typography.body, color: colors.textPrimary, fontWeight: "500", flex: 1 },
  paymentPct: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  paymentMeta: { marginTop: 2 },
  paymentMetaText: { ...typography.small, color: colors.textTertiary },
  customerRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.sm },
  customerName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  customerMeta: { ...typography.small, color: colors.textSecondary },
});
