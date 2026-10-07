import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Platform } from "react-native";
import { router } from "expo-router";
import type { FunctionReference } from "convex/server";

import { colors, spacing, radius, shadow } from "../../theme/colors";
import { useAuthStore } from "../../stores/auth-store";
import { useSafeQuery } from "../../lib/hooks";
import { REPORTS_SECTIONS, hubSections } from "../../lib/hubs";
import { isTabReachable } from "../../lib/tab-visibility";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { tabPresentation } from "../../lib/workspace-presentation";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import { customerHref, newCampaignFromPresetHref } from "../../lib/navigation";
import { isSmsCampaignsAvailable } from "../../lib/sms/availability";
import {
  DASHBOARD_WINDOWS,
  selectDashboardWindow,
  type BringBackAction,
} from "../../lib/customer-hub/dashboard";
import { selectIsCustomerHubOn } from "../../lib/customer-hub/availability";
import { resolveInsightsState } from "../../lib/customer-hub/insights-state";
import { useCustomerDashboard, useRewardsSnapshot } from "../../lib/customer-hub/use-reports-dashboard";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SubScreenLinks } from "../../components/SubScreenLinks";
import { SectionHeader } from "../../components/SectionHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { ListRow } from "../../components/ListRow";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { HeroRevenueCard } from "../../components/HeroRevenueCard";
import { CustomerInsights } from "../../components/reports/CustomerInsights";
import { InsightsNotice } from "../../components/reports/InsightsNotice";
import { ReportsColumns, useIsWideReports } from "../../components/reports/ReportsColumns";

const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;

interface SalesSnapshot {
  totalRevenue: number;
  completedOrders: number;
  avgOrderValue: number;
  /** Fraction; 0 also when there was nothing before to compare with. */
  revenueGrowth: number;
}

const DEFAULT_DAYS = 30;
const PERIOD_OPTIONS = DASHBOARD_WINDOWS.map((days) => ({ label: `${days} days`, value: days as number }));
const canText = isSmsCampaignsAvailable(Platform.OS);

/**
 * Reports: the store's customers first, every other report one tap below.
 *
 * It used to be a list of six report names, so the first thing a merchant met
 * was a choice instead of an answer. Now it opens on the answer — how much came
 * in and from whom, the dials behind it, and who to bring back today — and the
 * sales, product and branch reports sit under "Dig deeper" for the days the
 * question is narrower. Guest list and Rewards are labelled doors in the header.
 *
 * Never an empty page: when customer figures are missing (a store not switched
 * on, the platform not yet updated, a failed read), the period's sales still
 * lead the screen from the app's own analytics read, with one card saying why
 * the customer half is absent.
 */
export default function ReportsScreen() {
  const outletName = useAuthStore((s) => s.outletName);
  const isHubOn = useAuthStore(selectIsCustomerHubOn);
  const ctx = useTabVisibilityContext();
  const canSeeCustomers = isTabReachable("customers", ctx);
  const canSeeRewards = isTabReachable("loyalty", ctx);
  const canSeeSales = isTabReachable("analytics", ctx);
  const sections = hubSections(REPORTS_SECTIONS, ctx);
  const isWide = useIsWideReports();

  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const dashboardQuery = useCustomerDashboard(canSeeCustomers);
  const rewardsQuery = useRewardsSnapshot(canSeeCustomers && canSeeRewards);

  const result = dashboardQuery.data;
  const dashboard = result?.ok ? result.overview.dashboard ?? null : null;
  const state = resolveInsightsState({
    canSeeCustomers,
    isHubOnLocally: isHubOn,
    isLoading: dashboardQuery.isLoading,
    hasError: dashboardQuery.error !== null,
    result: result && (result.ok ? { ok: true, hasDashboard: dashboard !== null } : result),
  });

  // The fallback headline: only read when the customer dashboard cannot lead.
  const needsSalesFallback = canSeeSales && state !== "ready" && state !== "loading";
  const sales = useSafeQuery<SalesSnapshot>(getSalesAnalyticsRef, needsSalesFallback ? { daysBack: days } : "skip");

  const window = useMemo(() => (dashboard ? selectDashboardWindow(dashboard, days) : null), [dashboard, days]);
  const periodLabel = `Last ${days} days`;
  const nowMs = dashboardQuery.dataUpdatedAt || Date.now();

  const open = useCallback(
    (tab: string) => goTo(router as TabAwareRouter<`/(main)/${string}`>, `/(main)/${tab}`),
    [],
  );

  const handleAction = useCallback(
    (action: BringBackAction) => {
      if (action.target.kind === "campaign") router.push(newCampaignFromPresetHref(action.target.preset));
      else if (action.target.kind === "loyalty") open("loyalty");
      else open("customers");
    },
    [open],
  );

  const { refetch: refetchDashboard, isRefetching } = dashboardQuery;
  const { refetch: refetchRewards } = rewardsQuery;
  const { refetch: refetchSales } = sales;
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchDashboard(), refetchRewards(), refetchSales()]);
  }, [refetchDashboard, refetchRewards, refetchSales]);

  const digDeeper =
    sections.length > 0 ? (
      <>
        <SectionHeader title="Dig deeper" hint="Sales, products and branches in detail" />
        <View style={styles.group}>
          {sections.flatMap((section) => section.tabs).map((tab, index, all) => {
            const p = tabPresentation(tab);
            return (
              <ListRow
                key={tab}
                icon={p.icon}
                title={p.label}
                subtitle={p.hint}
                onPress={() => open(tab)}
                grouped={index < all.length - 1}
              />
            );
          })}
        </View>
      </>
    ) : null;

  const salesHero =
    needsSalesFallback && sales.data ? (
      <HeroRevenueCard
        revenue={sales.data.totalRevenue}
        orderCount={sales.data.completedOrders}
        avgOrder={sales.data.avgOrderValue}
        periodLabel={periodLabel}
        delta={sales.data.revenueGrowth === 0 ? null : sales.data.revenueGrowth}
        comparisonLabel={`the ${days} days before`}
      />
    ) : null;

  const notice =
    state === "off" || state === "pending_update" || state === "error" ? (
      <InsightsNotice state={state} onRetry={handleRefresh} />
    ) : null;

  const body = (() => {
    if (state === "ready" && dashboard && window) {
      return (
        <CustomerInsights
          isWide={isWide}
          aside={digDeeper}
          dashboard={dashboard}
          window={window}
          periodLabel={periodLabel}
          nowMs={nowMs}
          coverageNote={result?.ok && !result.overview.coverage.complete ? result.overview.coverage.note ?? null : null}
          canText={canText}
          rewards={rewardsQuery.data ?? null}
          onAction={handleAction}
          onStartRewards={canSeeRewards ? () => open("loyalty") : undefined}
          onOpenCustomer={(customerId) => router.push(customerHref(customerId))}
          onSeeAllGuests={() => open("customers")}
        />
      );
    }
    if (state === "loading") {
      // A lifetime read can take seconds on a big store; the other reports
      // stay one tap away instead of hiding behind the spinner.
      return (
        <ReportsColumns
          isWide={isWide}
          main={<LoadingState message="Reading your customers" />}
          side={<View style={isWide ? styles.sideTop : undefined}>{digDeeper}</View>}
        />
      );
    }
    if (!salesHero && !notice && !digDeeper) {
      return <EmptyState message="Your account has no reports to show" />;
    }
    return (
      <ReportsColumns
        isWide={isWide}
        main={
          <>
            {salesHero}
            {salesHero && notice ? <View style={styles.gap} /> : null}
            {notice}
          </>
        }
        side={<View style={isWide ? styles.sideTop : undefined}>{digDeeper}</View>}
      />
    );
  })();

  const showsPeriod = state === "ready" || needsSalesFallback;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Reports"
        subtitle={outletName ? `How ${outletName} is doing` : "How the store is doing"}
        actions={<SubScreenLinks parent="reports" variant="pills" />}
      >
        {showsPeriod ? (
          <View style={isWide ? styles.periodWide : undefined}>
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={days}
              onChange={setDays}
              accessibilityPrefix="Show the last"
            />
          </View>
        ) : null}
      </ScreenHeader>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
      >
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2 },
  gap: { height: spacing.md },
  // In two columns the side's first heading would otherwise sit a heading's
  // margin below the hero it is meant to line up with.
  sideTop: { marginTop: -spacing.xl },
  periodWide: { maxWidth: 420 },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
});
