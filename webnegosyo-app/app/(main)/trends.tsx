import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { useQuery } from "convex/react";
import { FunctionReference } from "convex/server";

const getTrendsRef = "analytics:getTrends" as unknown as FunctionReference<"query">;

interface DailyStat {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

function SimpleBarChart({ data, valueKey, color, label }: {
  data: DailyStat[];
  valueKey: keyof DailyStat;
  color: string;
  label: string;
}) {
  if (data.length === 0) return null;

  const values = data.map((d) => Number(d[valueKey]) || 0);
  const maxVal = Math.max(...values, 1);
  const barWidth = Math.max(((SCREEN_WIDTH - 80) / data.length) - 4, 8);

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartLabel}>{label}</Text>
      <View style={styles.chartBody}>
        <View style={styles.barsContainer}>
          {data.map((d, i) => {
            const height = (values[i] / maxVal) * 120;
            return (
              <View key={d.date} style={styles.barWrapper}>
                <Text style={styles.barValue}>
                  {valueKey === "totalRevenue" ? `\u20B1${values[i].toFixed(0)}` : values[i].toString()}
                </Text>
                <View style={[styles.bar, { height, backgroundColor: color, width: barWidth }]} />
                <Text style={styles.barLabel}>
                  {d.date.slice(5)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TrendsScreen() {
  const [daysBack, setDaysBack] = useState(14);
  const trends = useQuery(getTrendsRef, { daysBack }) as DailyStat[] | undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Trends</Text>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {[7, 14, 30].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.periodTab, daysBack === d && styles.periodTabActive]}
            onPress={() => setDaysBack(d)}
          >
            <Text style={[styles.periodText, daysBack === d && styles.periodTextActive]}>
              {d}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!trends ? (
        <Text style={styles.emptyText}>Loading trends...</Text>
      ) : trends.length === 0 ? (
        <Text style={styles.emptyText}>No trend data yet. Data will appear after daily stats are aggregated.</Text>
      ) : (
        <>
          {/* Summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {trends.reduce((s, d) => s + d.totalOrders, 0)}
              </Text>
              <Text style={styles.summaryLabel}>Total Orders</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {"\u20B1"}{trends.reduce((s, d) => s + d.totalRevenue, 0).toFixed(0)}
              </Text>
              <Text style={styles.summaryLabel}>Total Revenue</Text>
            </View>
          </View>

          <SimpleBarChart data={trends} valueKey="totalRevenue" color="#4F46E5" label="Daily Revenue" />
          <SimpleBarChart data={trends} valueKey="totalOrders" color="#10B981" label="Daily Orders" />
          <SimpleBarChart data={trends} valueKey="avgOrderValue" color="#F59E0B" label="Avg Order Value" />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F0F" },
  content: { padding: 20 },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 16 },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  periodTab: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A" },
  periodTabActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  periodText: { color: "#999", fontSize: 14, fontWeight: "500" },
  periodTextActive: { color: "#fff" },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, backgroundColor: "#1A1A1A", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#2A2A2A" },
  summaryValue: { fontSize: 22, fontWeight: "bold", color: "#fff" },
  summaryLabel: { fontSize: 12, color: "#999", marginTop: 4 },
  chartContainer: { backgroundColor: "#1A1A1A", borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#2A2A2A" },
  chartLabel: { fontSize: 15, fontWeight: "600", color: "#fff", marginBottom: 12 },
  chartBody: { alignItems: "center" },
  barsContainer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 4, height: 160 },
  barWrapper: { alignItems: "center" },
  bar: { borderRadius: 4, minHeight: 2 },
  barValue: { fontSize: 8, color: "#999", marginBottom: 4, textAlign: "center" },
  barLabel: { fontSize: 8, color: "#666", marginTop: 4, textAlign: "center" },
  emptyText: { color: "#666", textAlign: "center", paddingVertical: 40, fontSize: 15 },
});
