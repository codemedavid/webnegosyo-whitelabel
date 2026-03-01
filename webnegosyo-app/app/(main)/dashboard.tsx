import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { supabase } from "../../lib/supabase";
import { router } from "expo-router";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Badge } from "../../components/Badge";

const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  statusCounts: Record<string, number>;
}

interface QueueOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  total: number;
  itemCount: number;
  orderType?: string;
  status: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const clear = useAuthStore((s) => s.clear);

  const { data: stats, isLoading, error: statsError } = useSafeQuery<DashboardStats>(getDashboardStatsRef);
  const { data: queue, error: queueError } = useSafeQuery<Record<string, QueueOrder[]>>(getRealtimeQueueRef);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clear();
    router.replace("/(auth)/login");
  };

  const error = statsError || queueError;

  if (!convexUrl || error) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.tenantName}>{tenantName ?? "Dashboard"}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
        <ErrorState
          message={error ?? "Convex is not configured for this tenant. Please contact support."}
          onRetry={() => router.replace("/(main)/dashboard")}
        />
      </View>
    );
  }

  const pendingCount = queue?.pending?.length ?? 0;
  const confirmCount = queue?.confirmed?.length ?? 0;
  const preparingCount = queue?.preparing?.length ?? 0;
  const readyCount = queue?.ready?.length ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.tenantName}>{tenantName ?? "Dashboard"}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <LoadingState message="Loading dashboard..." />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard value={stats?.totalOrders ?? 0} label="Orders Today" />
            <StatCard value={`₱${(stats?.totalRevenue ?? 0).toFixed(0)}`} label="Revenue" />
          </View>
          <View style={styles.statsRow}>
            <StatCard value={`₱${(stats?.avgOrderValue ?? 0).toFixed(0)}`} label="Avg Order" />
            <StatCard value={pendingCount + confirmCount + preparingCount + readyCount} label="Active Orders" />
          </View>

          <Text style={styles.sectionTitle}>Order Queue</Text>
          <View style={styles.queueRow}>
            {([
              { label: "Pending", count: pendingCount, color: colors.warningLight, textColor: colors.statusPending.text },
              { label: "Confirmed", count: confirmCount, color: colors.infoLight, textColor: colors.statusConfirmed.text },
              { label: "Preparing", count: preparingCount, color: "#FFF8E1", textColor: colors.statusPreparing.text },
              { label: "Ready", count: readyCount, color: colors.successLight, textColor: colors.statusReady.text },
            ] as const).map((item) => (
              <View key={item.label} style={[styles.queueItem, { backgroundColor: item.color }]}>
                <Text style={[styles.queueCount, { color: item.textColor }]}>{item.count}</Text>
                <Text style={[styles.queueLabel, { color: item.textColor }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Recent Pending</Text>
          {pendingCount === 0 ? (
            <EmptyState message="No pending orders" />
          ) : (
            (queue?.pending ?? []).slice(0, 5).map((order) => (
              <TouchableOpacity
                key={order._id}
                style={styles.orderCard}
                onPress={() => router.push(`/(main)/order/${order._id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderName}>{order.customerName}</Text>
                  <Text style={styles.orderTotal}>₱{order.total.toFixed(2)}</Text>
                </View>
                <View style={styles.orderMeta}>
                  <Text style={styles.orderMetaText}>
                    {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · {order.orderType ?? "N/A"}
                  </Text>
                  <Badge label="pending" variant="pending" />
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.xxl },
  greeting: { ...typography.body, color: colors.textSecondary },
  tenantName: { ...typography.title, color: colors.textPrimary, marginTop: 2 },
  logoutButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  logoutText: { ...typography.body, color: colors.danger, fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  queueRow: { flexDirection: "row", gap: spacing.sm },
  queueItem: { flex: 1, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  queueCount: { fontSize: 22, fontWeight: "700" },
  queueLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  orderCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.sm },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderName: { ...typography.heading, color: colors.textPrimary },
  orderTotal: { ...typography.heading, color: colors.primary },
  orderMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  orderMetaText: { ...typography.caption, color: colors.textSecondary },
});
