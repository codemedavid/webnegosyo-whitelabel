import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { formatPeso } from "../../lib/format";
import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { supabase } from "../../lib/supabase";
import { router } from "expo-router";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Badge } from "../../components/Badge";
import { useOrderAlerts } from "../../hooks/useOrderAlerts";
import { PeriodSelector } from "../../components/PeriodSelector";

const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;
// TODO: Replace double type assertion with proper Convex-generated function reference type
// when the codegen pipeline is set up. This pattern is used throughout the app as a workaround
// for the template architecture where generated types aren't available in the mobile app.
const getDashboardStatsByPeriodRef = "orders:getDashboardStatsByPeriod" as unknown as FunctionReference<"query">;

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

const DASHBOARD_PERIODS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "This Year", value: "this_year" },
];

function getDateRange(period: string): { startDate: number; endDate: number } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  switch (period) {
    case "yesterday": {
      const start = todayStart - 24 * 60 * 60 * 1000;
      return { startDate: start, endDate: todayStart - 1 };
    }
    case "this_week": {
      const dayOfWeek = now.getDay();
      const start = todayStart - dayOfWeek * 24 * 60 * 60 * 1000;
      return { startDate: start, endDate: todayEnd };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { startDate: start, endDate: todayEnd };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1).getTime();
      return { startDate: start, endDate: todayEnd };
    }
    default:
      return { startDate: todayStart, endDate: todayEnd };
  }
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
  const isDemo = useAuthStore((s) => s.isDemo);
  const clear = useAuthStore((s) => s.clear);
  const { isConnected, loadSaved } = usePrinterStore();

  const [period, setPeriod] = useState("today");
  const dateRange = useMemo(() => getDateRange(period), [period]);
  const [refreshing, setRefreshing] = useState(false);

  // Convex queries are reactive (they update on their own), but merchants expect
  // pull-to-refresh to do *something* — show a brief spinner so the gesture is
  // acknowledged. The green "Live" dot communicates that data updates automatically.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const { data: stats, isLoading, error: statsError } = useSafeQuery<DashboardStats>(getDashboardStatsRef);
  const { data: periodStats, isLoading: periodLoading } = useSafeQuery<DashboardStats>(
    getDashboardStatsByPeriodRef,
    period !== "today" ? dateRange : "skip"
  );
  const { data: queue, error: queueError } = useSafeQuery<Record<string, QueueOrder[]>>(getRealtimeQueueRef);

  const displayStats = period === "today" ? stats : periodStats;
  const isStatsLoading = period === "today" ? isLoading : periodLoading;
  const showPrinterSettings = Platform.OS !== "ios";

  // Alert on new pending orders
  useOrderAlerts({ orders: queue?.pending, enabled: !!convexUrl });

  useEffect(() => {
    loadSaved();
  }, []);

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
          <View style={styles.headerRight}>
            {showPrinterSettings && (
              <TouchableOpacity
                onPress={() => router.push("/(main)/printer-settings")}
                style={styles.printerButton}
              >
                <Text style={{ fontSize: 20 }}>🖨</Text>
                <View style={[styles.printerDot, { backgroundColor: isConnected ? colors.success : colors.textTertiary }]} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.tenantName}>{tenantName ?? "Dashboard"}</Text>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live · updates automatically</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => router.push("/(main)/scan")}
            style={styles.scanButton}
            activeOpacity={0.8}
          >
            <Text style={styles.scanButtonText}>⧉ Scan QR</Text>
          </TouchableOpacity>
          {showPrinterSettings && (
            <TouchableOpacity
              onPress={() => router.push("/(main)/printer-settings")}
              style={styles.printerButton}
            >
              <Text style={{ fontSize: 20 }}>🖨</Text>
              <View style={[styles.printerDot, { backgroundColor: isConnected ? colors.success : colors.textTertiary }]} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isDemo && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerTitle}>You&apos;re viewing a demo store</Text>
          <Text style={styles.demoBannerBody}>
            Browse real-time orders and analytics with sample data. To manage
            your own store, sign out and tap &quot;Create your store.&quot;
          </Text>
        </View>
      )}

      {isStatsLoading ? (
        <LoadingState message="Loading dashboard..." />
      ) : (
        <>
          <PeriodSelector periods={DASHBOARD_PERIODS} selected={period} onSelect={setPeriod} />
          <View style={styles.statsRow}>
            <StatCard value={displayStats?.totalOrders ?? 0} label={period === "today" ? "Orders Today" : "Total Orders"} />
            <StatCard value={formatPeso(displayStats?.totalRevenue ?? 0, 0)} label="Revenue" />
          </View>
          <View style={styles.statsRow}>
            <StatCard value={formatPeso(displayStats?.avgOrderValue ?? 0, 0)} label="Avg Order" />
            <StatCard value={pendingCount + confirmCount + preparingCount + readyCount} label="Active Now" />
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
                  <Text style={styles.orderTotal}>{formatPeso(order.total)}</Text>
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
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { ...typography.small, color: colors.textTertiary },
  logoutButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  logoutText: { ...typography.body, color: colors.danger, fontWeight: "500" },
  demoBanner: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  demoBannerTitle: { ...typography.body, color: colors.primary, fontWeight: "700" },
  demoBannerBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
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
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  scanButtonText: { ...typography.caption, color: "#FFFFFF", fontWeight: "600" },
  printerButton: { position: "relative", padding: spacing.sm },
  printerDot: { position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4 },
});
