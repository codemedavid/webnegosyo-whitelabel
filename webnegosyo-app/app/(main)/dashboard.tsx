import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { router } from "expo-router";

import { useSafeQuery } from "../../lib/hooks";
import { filterQueueToScope, deriveStatsForScope, type StatOrderLike } from "../../lib/branch-dashboard";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { useBranchScope } from "../../lib/use-branch-scope";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { isPortfolioAvailable } from "../../lib/portfolio-landing";
import { isTabReachable } from "../../lib/tab-visibility";
import { quickActionsFor } from "../../lib/home-quick-actions";
import { revenueDelta, todayRange, yesterdayRange } from "../../lib/home-period";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useAuthStore } from "../../stores/auth-store";
import { usePrinterStore } from "../../stores/printer-store";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { HeroRevenueCard } from "../../components/HeroRevenueCard";
import { QuickActions } from "../../components/QuickActions";
import { StatusPipeline } from "../../components/StatusPipeline";
import { OrderCard } from "../../components/OrderCard";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { IconButton } from "../../components/IconButton";
import { ListRow } from "../../components/ListRow";
import { ShiftStatusStrip } from "../../components/ShiftStatusStrip";

const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getDashboardStatsByPeriodRef = "orders:getDashboardStatsByPeriod" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;
const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/**
 * How many recent orders a branch account pulls to re-derive its own stat
 * tiles. Matches the window the product-analytics screen already accepts: past
 * this many orders in the period the branch totals under-report, which is why
 * the indexed `outletId` server-side filter is the real fix.
 */
const BRANCH_STATS_ORDER_WINDOW = 2000;

/** The oldest pending orders shown on Home before "See all" takes over. */
const ATTENTION_LIMIT = 5;

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

function HeaderActions({ isConnected }: { isConnected: boolean }) {
  return (
    <>
      <IconButton
        icon="printer"
        label="Printer"
        dot={isConnected ? colors.success : colors.textTertiary}
        onPress={() => router.push("/(main)/printer-settings")}
      />
      <IconButton icon="qr" label="Scan QR" tone="primary" onPress={() => router.push("/(main)/scan")} />
    </>
  );
}

/**
 * Home: today's money first, then the things the merchant does most, then
 * the orders that need a hand.
 *
 * It answers one question — how is today going? — and points at everything
 * else. Other periods live in Reports; other screens are a tab or a quick
 * action away. Nothing here needs the merchant to know which section a
 * screen belongs to.
 */
export default function DashboardScreen() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const outletName = useAuthStore((s) => s.outletName);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isDemo = useAuthStore((s) => s.isDemo);
  const hasBackend = hasLiveOrderBackend({ convexUrl, orderBackend });
  const isConnected = usePrinterStore((s) => s.isConnected);
  const loadSaved = usePrinterStore((s) => s.loadSaved);

  const ctx = useTabVisibilityContext();
  const quickActions = useMemo(() => quickActionsFor(ctx), [ctx]);
  const showBranches = isPortfolioAvailable(ctx.audience);
  // The drawer's own screen is the only place the shift can be opened or
  // closed, so an account that cannot reach it has no shift to report.
  const showShift = isTabReachable("pos-sales", ctx);

  const [refreshing, setRefreshing] = useState(false);
  // Spread into a fresh literal: the query hook wants an indexable record,
  // and the interface deliberately is not one.
  const yesterday = useMemo(() => ({ ...yesterdayRange(new Date()) }), []);
  const today = useMemo(() => todayRange(new Date()), []);

  const { data: stats, isLoading, error: statsError, refetch: refetchStats } =
    useSafeQuery<DashboardStats>(getDashboardStatsRef);
  // Yesterday is the comparison every takings figure needs to mean anything.
  const { data: yesterdayStats, refetch: refetchYesterday } =
    useSafeQuery<DashboardStats>(getDashboardStatsByPeriodRef, yesterday);
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
    useSafeQuery<StatOrderLike[]>(
      getOrdersRef,
      isBranchScoped ? { limit: BRANCH_STATS_ORDER_WINDOW } : "skip"
    );

  // Pull-to-refresh re-reads every query this screen holds. On a Convex tenant
  // the reads are live subscriptions and the refetches resolve at once; the
  // spinner still shows for a beat so the gesture is acknowledged.
  const onRefresh = useCallback(
    () =>
      refreshWithMinSpinner(
        [refetchStats, refetchYesterday, refetchQueue, refetchScopedOrders],
        setRefreshing
      ),
    [refetchStats, refetchYesterday, refetchQueue, refetchScopedOrders]
  );

  const queue = useMemo(() => filterQueueToScope(scope, rawQueue), [scope, rawQueue]);

  const branchToday = useMemo(
    () => (isBranchScoped ? deriveStatsForScope(scope, scopedOrders, today) : null),
    [isBranchScoped, scope, scopedOrders, today]
  );
  const branchYesterday = useMemo(
    () => (isBranchScoped ? deriveStatsForScope(scope, scopedOrders, yesterday) : null),
    [isBranchScoped, scope, scopedOrders, yesterday]
  );

  const displayStats = branchToday ?? stats;
  const comparison = branchYesterday ?? yesterdayStats;
  const isStatsLoading = isBranchScoped ? scopedOrdersLoading : isLoading;
  const delta = revenueDelta(displayStats?.totalRevenue, comparison?.totalRevenue);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const error = statsError || queueError;

  // Names the branch whose queue this is. A staffer moving between outlets
  // must never mistake one branch's numbers for another's.
  const subtitle = outletName ? `${getGreeting()} · ${outletName}` : getGreeting();

  const tabRouter = router as TabAwareRouter<`/(main)/${string}`>;

  if (!hasBackend || error) {
    return (
      <View style={styles.screen}>
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

  // Oldest pending first — those are the orders most at risk of a wait complaint.
  const needsAttention = [...(queue?.pending ?? [])]
    .sort((a, b) => a._creationTime - b._creationTime)
    .slice(0, ATTENTION_LIMIT);

  return (
    <View style={styles.screen}>
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

        {/* Above the takings and outside their loading gate: whether a drawer
            is open is the cashier's first question of the day, and it must not
            wait on an order query to be answered. */}
        {showShift && <ShiftStatusStrip onPress={() => goTo(tabRouter, "/(main)/pos-sales")} />}

        {isStatsLoading ? (
          <LoadingState message="Loading today..." />
        ) : (
          <>
            <HeroRevenueCard
              revenue={displayStats?.totalRevenue ?? 0}
              orderCount={displayStats?.totalOrders ?? 0}
              avgOrder={displayStats?.avgOrderValue ?? 0}
              periodLabel="Today"
              isLive
              delta={delta}
              comparisonLabel="yesterday"
            />

            <QuickActions
              actions={quickActions}
              onPress={(action) => goTo(tabRouter, action.href as `/(main)/${string}`)}
            />

            <SectionHeader
              title="Orders now"
              hint={activeCount === 0 ? "Nothing in the queue" : `${activeCount} in the queue`}
              actionLabel="See all"
              onAction={() => goTo(tabRouter, "/(main)/orders")}
              style={styles.firstSection}
            />
            <StatusPipeline
              stages={[
                { key: "pending", label: "Pending", count: pendingCount },
                { key: "confirmed", label: "Confirmed", count: confirmCount },
                { key: "preparing", label: "Preparing", count: preparingCount },
                { key: "ready", label: "Ready", count: readyCount },
              ]}
              onStagePress={(key) => router.push(`/(main)/orders?status=${key}`)}
            />

            <SectionHeader
              title="Needs attention"
              hint="Oldest pending orders first"
              trailing={
                pendingCount > 0 ? (
                  <View style={styles.attentionBadge}>
                    <Text style={styles.attentionBadgeText}>{pendingCount}</Text>
                  </View>
                ) : undefined
              }
            />
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

            {showBranches ? (
              <>
                <SectionHeader title="Your branches" hint="Every branch at a glance" />
                <View style={styles.group}>
                  <ListRow
                    icon="storefront"
                    title="Branches"
                    subtitle="Today's takings per branch — tap one to run it"
                    onPress={() => goTo(tabRouter, "/(main)/portfolio")}
                    grouped
                  />
                  <ListRow
                    icon="compare"
                    title="Compare branches"
                    subtitle="Branch against branch, over longer periods"
                    onPress={() => goTo(tabRouter, "/(main)/branches")}
                  />
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  demoBanner: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    ...shadow.sm,
  },
  demoBannerTitle: { ...typography.body, color: colors.accent, fontWeight: "700" },
  demoBannerBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  firstSection: { marginTop: spacing.sm },
  attentionBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.statusPending.bg,
    alignItems: "center",
  },
  attentionBadgeText: { fontSize: 12, fontWeight: "800", color: colors.statusPending.text },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
});
