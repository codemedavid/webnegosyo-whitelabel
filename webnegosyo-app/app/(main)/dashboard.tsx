import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { filterQueueToScope, deriveStatsForScope, type StatOrderLike } from "../../lib/branch-dashboard";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { useBranchScope } from "../../lib/use-branch-scope";
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
// Rendered by <ScreenHeader>; the import stays so the guardrail that every
// tab is escapable keeps reading it here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { ScreenHeader } from "../../components/ScreenHeader";
import { IconButton } from "../../components/IconButton";
import { goTo } from "../../lib/tab-navigation";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";

const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;
const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/**
 * How many recent orders a branch account pulls to re-derive its own stat
 * tiles. Matches the window the product-analytics screen already accepts: past
 * this many orders in the period the branch totals under-report, which is why
 * the indexed `outletId` server-side filter is the real fix.
 */
const BRANCH_STATS_ORDER_WINDOW = 2000;

type BranchStatOrder = StatOrderLike;
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
    <>
      <IconButton
        icon="printer"
        label="Printer"
        dot={isConnected ? colors.success : colors.textTertiary}
        onPress={() => router.push("/(main)/printer-settings")}
      />
      <IconButton icon="account" label="Account" onPress={() => router.push("/(main)/account")} />
      <IconButton icon="qr" label="Scan QR" tone="primary" onPress={() => router.push("/(main)/scan")} />
    </>
  );
}

export default function DashboardScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const outletName = useAuthStore((s) => s.outletName);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const hasBackend = hasLiveOrderBackend({ convexUrl, orderBackend });
  const isConnected = usePrinterStore((s) => s.isConnected);
  const loadSaved = usePrinterStore((s) => s.loadSaved);

  const [period, setPeriod] = useState("today");
  const dateRange = useMemo(() => getDateRange(period), [period]);
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading, error: statsError, refetch: refetchStats } =
    useSafeQuery<DashboardStats>(getDashboardStatsRef);
  const { data: periodStats, isLoading: periodLoading, refetch: refetchPeriodStats } =
    useSafeQuery<DashboardStats>(getDashboardStatsByPeriodRef, period !== "today" ? dateRange : "skip");
  const { data: rawQueue, error: queueError, refetch: refetchQueue } =
    useSafeQuery<Record<string, QueueOrder[]>>(getRealtimeQueueRef);

  const scope = useBranchScope();
  const isBranchScoped = scope.kind === "branch";

  // The stat tiles are aggregated inside Convex over the whole tenant, so a
  // branch account cannot use them — it would read store-wide revenue above its
  // own order list. Pull the raw orders instead and re-derive the tiles here so
  // the two always describe the same set. Store-wide accounts skip this query
  // entirely and keep using the cheaper server-side aggregate.
  const { data: scopedOrders, isLoading: scopedOrdersLoading, refetch: refetchScopedOrders } =
    useSafeQuery<BranchStatOrder[]>(
      getOrdersRef,
      isBranchScoped ? { limit: BRANCH_STATS_ORDER_WINDOW } : "skip"
    );

  // Pull-to-refresh re-reads every query this screen holds. On a Convex tenant
  // the reads are live subscriptions and the refetches resolve at once; the
  // spinner still shows for a beat so the gesture is acknowledged.
  const onRefresh = useCallback(
    () =>
      refreshWithMinSpinner(
        [refetchStats, refetchPeriodStats, refetchQueue, refetchScopedOrders],
        setRefreshing
      ),
    [refetchStats, refetchPeriodStats, refetchQueue, refetchScopedOrders]
  );

  const queue = useMemo(() => filterQueueToScope(scope, rawQueue), [scope, rawQueue]);

  const todayRange = useMemo(() => getDateRange("today"), []);
  const branchStats = useMemo(() => {
    if (!isBranchScoped) return null;
    return deriveStatsForScope(scope, scopedOrders, period === "today" ? todayRange : dateRange);
  }, [isBranchScoped, scope, scopedOrders, period, todayRange, dateRange]);

  const displayStats = branchStats ?? (period === "today" ? stats : periodStats);
  const isStatsLoading = isBranchScoped
    ? scopedOrdersLoading
    : period === "today"
      ? isLoading
      : periodLoading;
  const periodLabel = DASHBOARD_PERIODS.find((p) => p.value === period)?.label ?? "Today";

  useEffect(() => {
    loadSaved();
  }, []);

  const error = statsError || queueError;

  // Names the branch whose queue this is. A staffer moving between outlets
  // must never mistake one branch's numbers for another's.
  const subtitle = outletName ? `${getGreeting()} · ${outletName}` : getGreeting();

  if (!hasBackend || error) {
    return (
      <View style={styles.screen}>
        {/* <ScreenHeader> mounts <WorkspaceSwitcher /> */}
        <ScreenHeader
          title={tenantName ?? "Home"}
          subtitle={subtitle}
          actions={<HeaderActions isConnected={isConnected} />}
        />
        <ErrorState
          message={error ?? "This store's order backend is not configured yet. Please contact support."}
          onRetry={() => goTo(router, "/(main)/dashboard")}
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
    <View style={styles.screen}>
      {/* <ScreenHeader> mounts <WorkspaceSwitcher /> */}
      <ScreenHeader
        title={tenantName ?? "Home"}
        subtitle={subtitle}
        actions={<HeaderActions isConnected={isConnected} />}
      />
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >

      {/* New-order alerts (ringtone + notification) are mounted once at the
          (main) tab layout via <GlobalOrderAlerts>, so they fire on every tab. */}

      {isDemo && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerTitle}>You&apos;re viewing a demo store</Text>
          <Text style={styles.demoBannerBody}>
            Browse real-time orders and analytics with sample data. To manage
            your own store, sign out and tap &quot;Create your store.&quot;
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl },
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
});
