import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";

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

function BarChart({ data, valueKey, color, label }: {
  data: DailyStat[];
  valueKey: keyof DailyStat;
  color: string;
  label: string;
}) {
  if (data.length === 0) return null;

  const values = data.map((d) => Number(d[valueKey]) || 0);
  const maxVal = Math.max(...values, 1);
  const barWidth = Math.max(((SCREEN_WIDTH - 100) / data.length) - 4, 6);

  return (
    <Card title={label} style={styles.chartCard}>
      <View style={styles.barsContainer}>
        {data.map((d, i) => {
          const height = (values[i] / maxVal) * 100;
          return (
            <View key={d.date} style={styles.barWrapper}>
              <Text style={styles.barValue}>
                {valueKey === "totalRevenue" ? `₱${values[i].toFixed(0)}` : values[i].toString()}
              </Text>
              <View style={[styles.bar, { height, backgroundColor: color, width: barWidth }]} />
              <Text style={styles.barLabel}>{d.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const PAYMENT_COLORS: Record<string, string> = {
  Cash: "#6366F1",
  GCash: "#10B981",
  Card: "#F59E0B",
  Unknown: "#94A3B8",
};

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
            <View style={[stackStyles.legendDot, { backgroundColor: PAYMENT_COLORS[m] ?? "#94A3B8" }]} />
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
                        backgroundColor: PAYMENT_COLORS[m] ?? "#94A3B8",
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
  const { data: trends, isLoading, error } = useSafeQuery<DailyStat[]>(getTrendsRef, { daysBack });
  const { data: salesAnalytics, error: salesError } = useSafeQuery<SalesAnalytics>(getSalesAnalyticsRef, { daysBack });
  const { data: paymentAnalytics, error: paymentError } = useSafeQuery<PaymentMethodAnalytics>(getPaymentMethodAnalyticsRef, { daysBack });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trends</Text>

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

      {error ? (
        <ErrorState message={error} />
      ) : isLoading ? (
        <LoadingState message="Loading trends..." />
      ) : (trends ?? []).length === 0 ? (
        <EmptyState message="No trend data yet. Data appears after daily stats are aggregated." />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <StatCard value={(trends ?? []).reduce((s, d) => s + d.totalOrders, 0)} label="Total Orders" />
            <StatCard value={`₱${(trends ?? []).reduce((s, d) => s + d.totalRevenue, 0).toFixed(0)}`} label="Total Revenue" />
          </View>

          <BarChart data={trends ?? []} valueKey="totalRevenue" color={colors.primary} label="Daily Revenue" />
          <BarChart data={trends ?? []} valueKey="totalOrders" color={colors.success} label="Daily Orders" />
          <BarChart data={trends ?? []} valueKey="avgOrderValue" color={colors.warning} label="Avg Order Value" />

          {/* Orders by Source — hidden if query not deployed */}
          {!salesError && salesAnalytics && (
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
                      backgroundColor: colors.success,
                    }]} />
                  </View>
                  <Text style={sourceStyles.value}>{salesAnalytics.ordersBySource.mobile}</Text>
                </View>
              </View>
            </Card>
          )}

          {/* Payment Trends — hidden if query not deployed */}
          {!paymentError && paymentAnalytics && paymentAnalytics.dailyBreakdown.length > 0 && (
            <StackedBarChart data={paymentAnalytics.dailyBreakdown} label="Payment Trends" />
          )}

          {/* Cancellation Summary — hidden if query not deployed */}
          {!salesError && salesAnalytics && salesAnalytics.cancelledOrders > 0 && (
            <Card title="Cancellations" style={styles.chartCard}>
              <View style={cancelStyles.row}>
                <View style={cancelStyles.metric}>
                  <Text style={cancelStyles.value}>{salesAnalytics.cancelledOrders}</Text>
                  <Text style={cancelStyles.label}>Cancelled</Text>
                </View>
                <View style={cancelStyles.metric}>
                  <Text style={cancelStyles.value}>₱{salesAnalytics.cancelledRevenue.toFixed(0)}</Text>
                  <Text style={cancelStyles.label}>Lost Revenue</Text>
                </View>
                <View style={cancelStyles.metric}>
                  <Text style={[cancelStyles.value, { color: colors.danger }]}>
                    {(salesAnalytics.cancellationRate * 100).toFixed(1)}%
                  </Text>
                  <Text style={cancelStyles.label}>Cancel Rate</Text>
                </View>
              </View>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

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
  summaryRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  chartCard: { marginBottom: spacing.lg },
  barsContainer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 3, height: 140, paddingTop: spacing.sm },
  barWrapper: { alignItems: "center" },
  bar: { borderRadius: 3, minHeight: 2 },
  barValue: { fontSize: 7, color: colors.textTertiary, marginBottom: 3, textAlign: "center" },
  barLabel: { fontSize: 7, color: colors.textTertiary, marginTop: 3, textAlign: "center" },
});

const sourceStyles = StyleSheet.create({
  container: { gap: spacing.md },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "500", width: 32 },
  barTrack: { flex: 1, height: 20, backgroundColor: colors.separator, borderRadius: 4 },
  barFill: { height: 20, borderRadius: 4 },
  value: { ...typography.body, color: colors.textPrimary, fontWeight: "600", width: 36, textAlign: "right" },
});

const cancelStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-around" },
  metric: { alignItems: "center" },
  value: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  label: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
