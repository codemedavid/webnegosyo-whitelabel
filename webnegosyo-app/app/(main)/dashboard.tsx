import React from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useQuery } from "convex/react";
import { FunctionReference } from "convex/server";

const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  statusCounts: Record<string, number>;
}

export default function DashboardScreen() {
  const stats = useQuery(getDashboardStatsRef) as DashboardStats | undefined;
  const queue = useQuery(getRealtimeQueueRef) as Record<string, any[]> | undefined;

  if (!stats) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  const pendingCount = queue?.pending?.length ?? 0;
  const confirmCount = queue?.confirmed?.length ?? 0;
  const preparingCount = queue?.preparing?.length ?? 0;
  const readyCount = queue?.ready?.length ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Dashboard</Text>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalOrders}</Text>
          <Text style={styles.statLabel}>Orders Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>&#8369;{stats.totalRevenue.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>&#8369;{stats.avgOrderValue.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Avg Order</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      {/* Queue Summary */}
      <Text style={styles.sectionTitle}>Order Queue</Text>
      <View style={styles.queueRow}>
        <View style={[styles.queueItem, { backgroundColor: "#FEF3C7" }]}>
          <Text style={styles.queueCount}>{pendingCount}</Text>
          <Text style={styles.queueLabel}>Pending</Text>
        </View>
        <View style={[styles.queueItem, { backgroundColor: "#DBEAFE" }]}>
          <Text style={styles.queueCount}>{confirmCount}</Text>
          <Text style={styles.queueLabel}>Confirmed</Text>
        </View>
        <View style={[styles.queueItem, { backgroundColor: "#FED7AA" }]}>
          <Text style={styles.queueCount}>{preparingCount}</Text>
          <Text style={styles.queueLabel}>Preparing</Text>
        </View>
        <View style={[styles.queueItem, { backgroundColor: "#BBF7D0" }]}>
          <Text style={styles.queueCount}>{readyCount}</Text>
          <Text style={styles.queueLabel}>Ready</Text>
        </View>
      </View>

      {/* Recent pending orders */}
      <Text style={styles.sectionTitle}>Recent Pending</Text>
      {(queue?.pending ?? []).slice(0, 5).map((order: any) => (
        <View key={order._id} style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderName}>{order.customerName}</Text>
            <Text style={styles.orderTotal}>&#8369;{order.total.toFixed(2)}</Text>
          </View>
          <Text style={styles.orderMeta}>
            {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · {order.orderType ?? "N/A"} · {new Date(order._creationTime).toLocaleTimeString()}
          </Text>
        </View>
      ))}
      {pendingCount === 0 && (
        <Text style={styles.emptyText}>No pending orders</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F0F" },
  content: { padding: 20 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0F0F0F" },
  loadingText: { color: "#999", fontSize: 16 },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: "#1A1A1A", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#2A2A2A" },
  statValue: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  statLabel: { fontSize: 13, color: "#999", marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  queueRow: { flexDirection: "row", gap: 8 },
  queueItem: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center" },
  queueCount: { fontSize: 20, fontWeight: "bold", color: "#111" },
  queueLabel: { fontSize: 11, color: "#444", marginTop: 2 },
  orderCard: { backgroundColor: "#1A1A1A", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#2A2A2A" },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderName: { fontSize: 15, fontWeight: "600", color: "#fff" },
  orderTotal: { fontSize: 15, fontWeight: "bold", color: "#4F46E5" },
  orderMeta: { fontSize: 12, color: "#999", marginTop: 4 },
  emptyText: { color: "#666", textAlign: "center", paddingVertical: 20 },
});
