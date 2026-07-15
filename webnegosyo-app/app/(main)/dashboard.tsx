import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { router } from "expo-router";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { StatCard } from "../../components/StatCard";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { PeriodSelector } from "../../components/PeriodSelector";
import { HeroRevenueCard } from "../../components/HeroRevenueCard";
import { StatusPipeline } from "../../components/StatusPipeline";
import { OrderCard } from "../../components/OrderCard";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

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

function HeaderActions({ isConnected }: { isConnected: boolean }) {
  return (
    <View style={styles.headerRight}>
      <TouchableOpacity
        onPress={() => router.push("/(main)/scan")}
        style={styles.scanButton}
        activeOpacity={0.8}
      >
        <Text style={styles.scanButtonText}>Scan QR</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/(main)/printer-settings")} style={styles.printerButton}>
        <Text style={styles.printerText}>Printer</Text>
        <View style={[styles.printerDot, { backgroundColor: isConnected ? colors.success : colors.textTertiary }]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/(main)/account")} style={styles.logoutButton}>
        <Text style={styles.accountText}>Account</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DashboardScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const isDemo = useAuthStore((s) => s.isDemo);
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
  const periodLabel = DASHBOARD_PERIODS.find((p) => p.value === period)?.label ?? "Today";

  useEffect(() => {
    loadSaved();
  }, []);

  const error = statsError || queueError;

  if (!convexUrl || error) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.tenantName}>{tenantName ?? "Dashboard"}</Text>
          </View>
          <HeaderActions isConnected={isConnected} />
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
  const activeCount = pendingCount + confirmCount + preparingCount + readyCount;
  const deliveredCount = displayStats?.statusCounts?.delivered ?? 0;

  // Oldest pending first — those are the orders most at risk of a wait complaint.
  const needsAttention = [...(queue?.pending ?? [])]
    .sort((a, b) => a._creationTime - b._creationTime)
    .slice(0, 5);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.tenantName} numberOfLines={1}>{tenantName ?? "Dashboard"}</Text>
        </View>
        <HeaderActions isConnected={isConnected} />
      </View>
      <View style={styles.switcherRow}>
        <WorkspaceSwitcher />
      </View>

      {/* New-order alerts (ringtone + notification) are mounted once at the
          (main) tab layout via <GlobalOrderAlerts>, so they fire on every tab. */}

      {isDemo && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerTitle}>You&apos;re viewing a demo store</Text>
          <Text style={styles.demoBannerBody}>
            Browse real-time orders and analytics with sample data. Sign out and
            sign in with your merchant account to manage your own store.
          </Text>
        </View>
      )}

      <PeriodSelector periods={DASHBOARD_PERIODS} selected={period} onSelect={setPeriod} />

      {isStatsLoading ? (
        <LoadingState message="Loading dashboard..." />
      ) : (
        <>
          <HeroRevenueCard
            revenue={displayStats?.totalRevenue ?? 0}
            orderCount={displayStats?.totalOrders ?? 0}
            avgOrder={displayStats?.avgOrderValue ?? 0}
            periodLabel={periodLabel}
            isLive={period === "today"}
          />

          <View style={styles.statsRow}>
            <StatCard value={activeCount} label="Active now" hint="In the queue" />
            <StatCard value={deliveredCount} label="Delivered" hint={periodLabel} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Order Queue</Text>
            <TouchableOpacity onPress={() => router.push("/(main)/orders")}>
              <Text style={styles.sectionLink}>View all</Text>
            </TouchableOpacity>
          </View>
          <StatusPipeline
            stages={[
              { key: "pending", label: "Pending", count: pendingCount },
              { key: "confirmed", label: "Confirmed", count: confirmCount },
              { key: "preparing", label: "Preparing", count: preparingCount },
              { key: "ready", label: "Ready", count: readyCount },
            ]}
            onStagePress={(key) => router.push(`/(main)/orders?status=${key}`)}
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs Attention</Text>
            {pendingCount > 0 && (
              <View style={styles.attentionBadge}>
                <Text style={styles.attentionBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </View>
          {needsAttention.length === 0 ? (
            <EmptyState message="You're all caught up — no pending orders" />
          ) : (
            needsAttention.map((order) => (
              <OrderCard
                key={order._id}
                order={order}
                compact
                onPress={() => router.push(`/(main)/order/${order._id}`)}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60, paddingBottom: spacing.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm },
  switcherRow: { flexDirection: "row", marginBottom: spacing.lg },
  headerText: { flex: 1, marginRight: spacing.sm },
  greeting: { ...typography.eyebrow, color: colors.textSecondary },
  tenantName: { ...typography.title, color: colors.textPrimary, marginTop: spacing.xs },
  logoutButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  accountText: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  demoBanner: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  demoBannerTitle: { ...typography.body, color: colors.accent, fontWeight: "700" },
  demoBannerBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.eyebrow, color: colors.textSecondary },
  sectionLink: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  attentionBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.statusPending.bg,
    alignItems: "center",
  },
  attentionBadgeText: { fontSize: 12, fontWeight: "800", color: colors.statusPending.text },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadow.sm,
  },
  scanButtonText: { ...typography.caption, color: colors.textOnDark, fontWeight: "700" },
  printerButton: { position: "relative", paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  printerText: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  printerDot: { position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: 4 },
});
