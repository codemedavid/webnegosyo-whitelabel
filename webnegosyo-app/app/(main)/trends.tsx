import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";

const getTrendsRef = "analytics:getTrends" as unknown as FunctionReference<"query">;

interface DailyStat {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
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

export default function TrendsScreen() {
  const [daysBack, setDaysBack] = useState(14);
  const trends = useSafeQuery<DailyStat[]>(getTrendsRef, { daysBack });

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

      {trends === undefined ? (
        <LoadingState message="Loading trends..." />
      ) : trends.length === 0 ? (
        <EmptyState message="No trend data yet. Data appears after daily stats are aggregated." />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <StatCard value={trends.reduce((s, d) => s + d.totalOrders, 0)} label="Total Orders" />
            <StatCard value={`₱${trends.reduce((s, d) => s + d.totalRevenue, 0).toFixed(0)}`} label="Total Revenue" />
          </View>

          <BarChart data={trends} valueKey="totalRevenue" color={colors.primary} label="Daily Revenue" />
          <BarChart data={trends} valueKey="totalOrders" color={colors.success} label="Daily Orders" />
          <BarChart data={trends} valueKey="avgOrderValue" color={colors.warning} label="Avg Order Value" />
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
