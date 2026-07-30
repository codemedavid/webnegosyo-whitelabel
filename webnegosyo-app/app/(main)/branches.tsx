import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";

import { useSafeQuery } from "../../lib/hooks";
import { formatCount } from "../../lib/format";
import {
  buildBranchKpis,
  hourOfDayVolume,
  storeKpiTotals,
  type KpiOrderLike,
} from "../../lib/branch-kpis";
import { assignBranchVerdicts } from "../../lib/branch-verdict";
import { buildKpiPeriod, PERIOD_CHOICES } from "../../lib/branch-period";
import { useAccountBranchScope } from "../../lib/use-branch-scope";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useOutlets } from "../../lib/use-outlets";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { StoreHeroCard } from "../../components/StoreHeroCard";
import { BranchPerformanceCard } from "../../components/BranchPerformanceCard";
import { HourVolumeChart } from "../../components/HourVolumeChart";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/**
 * How many recent orders every figure on this screen is derived from.
 *
 * On Convex the branch lives in an unindexed `customerData` blob, so it cannot
 * be grouped in the query — the same ceiling the dashboard's branch tiles and
 * the portfolio accept. Past this many orders the figures under-report, which is
 * why the screen says so rather than leaving the merchant to discover it.
 *
 * The window has to cover the *previous* period too, since every trend arrow is
 * measured against it: a 90-day comparison reads 180 days of history.
 */
const ORDER_WINDOW = 2000;

/**
 * Branch performance — the owner's comparison screen.
 *
 * Deliberately five KPIs per branch and one verdict, not a wall of numbers. The
 * five each expose a different lever (ticket size, loyalty, throughput, leak,
 * and the revenue trend that is the outcome of all four), and the verdict names
 * the single one to act on. What is *not* here matters as much: prime cost and
 * customer-acquisition cost are the two figures F&B operators are told to run
 * their business on, and this platform holds neither labour hours nor ad spend,
 * so showing an estimate of either would invite a hiring or marketing decision
 * made on a guess.
 *
 * Branches are ranked by revenue per trading hour rather than by takings. Raw
 * revenue always crowns whichever branch sits in the busiest location, which the
 * owner already knows; normalising by the hours each branch actually traded is
 * what makes a small branch running well visible next to a big one coasting.
 *
 * Scope comes from `useAccountBranchScope`, deliberately not `useBranchScope`: a
 * branch-locked account sees only its own row, while an owner who has drilled
 * into one branch still needs every branch here, since comparing is the entire
 * purpose of the screen.
 */
export default function BranchesScreen() {
  const scope = useAccountBranchScope();
  const [periodDays, setPeriodDays] = useState(PERIOD_CHOICES[0].days);
  const [refreshing, setRefreshing] = useState(false);

  const { outlets, isLoading: outletsLoading, error: outletsError, reload } = useOutlets();
  const { data: orders, error: ordersError } = useSafeQuery<KpiOrderLike[]>(getOrdersRef, {
    limit: ORDER_WINDOW,
  });

  const selectBranch = useBranchContextStore((s) => s.selectBranch);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const periodChoice =
    PERIOD_CHOICES.find((choice) => choice.days === periodDays) ?? PERIOD_CHOICES[0];

  const { rows, totals, hours } = useMemo(() => {
    // Anchored per computation rather than held in state: the window must roll
    // over at Manila midnight without the merchant reopening the screen.
    const period = buildKpiPeriod(periodDays, Date.now());
    const scoped = filterOrdersToScope(scope, orders) as KpiOrderLike[];
    const kpis = buildBranchKpis(scoped, outlets, period);

    return {
      rows: assignBranchVerdicts(kpis, { periodDays: period.days }),
      totals: storeKpiTotals(kpis),
      hours: hourOfDayVolume(scoped, period),
    };
  }, [scope, orders, outlets, periodDays]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
    // The order query pushes fresh data on its own; the gesture is an affordance
    // for the branch list, which does not.
    setTimeout(() => setRefreshing(false), 600);
  }, [reload]);

  const openBranch = useCallback(
    (outletId: string, outletName: string) => {
      selectBranch(outletId, outletName);
      setWorkspace("operations");
      // navigate, not replace — replacing into a sibling tab remounts the tab
      // navigator mid-switch and crashes. See lib/tab-navigation.ts.
      goTo(router as TabAwareRouter<`/(main)/${string}`>, "/(main)/dashboard");
    },
    [selectBranch, setWorkspace],
  );

  if (outletsError) return <ErrorState message={outletsError} />;
  if (ordersError) return <ErrorState message="Could not load branch performance" />;
  if (outletsLoading || orders === undefined) return <LoadingState />;

  const branchRows = rows.filter((row) => row.outletId !== null);
  const unassignedRow = rows.find((row) => row.outletId === null);
  const leader = rows.find((row) => row.verdict.kind === "scale");
  const needsAttention = branchRows.filter((row) => row.verdict.tone === "bad").length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Branches</Text>
        <WorkspaceSwitcher />
      </View>

      <View style={styles.periodRow}>
        {PERIOD_CHOICES.map((choice) => {
          const isActive = choice.days === periodDays;
          return (
            <TouchableOpacity
              key={choice.days}
              style={[styles.periodPill, isActive && styles.periodPillActive]}
              onPress={() => setPeriodDays(choice.days)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.periodText, isActive && styles.periodTextActive]}>
                {choice.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <StoreHeroCard
        totals={totals}
        periodLabel={periodChoice.label}
        branchCount={outlets.length}
      />

      {branchRows.length === 0 ? (
        <Card>
          <EmptyState message="No branches yet. Add one to see how each location is doing." />
        </Card>
      ) : (
        <>
          {/* The headline sentence. An owner who reads nothing else should still
              leave knowing which branch to copy and how many are bleeding. */}
          <View style={styles.readout}>
            <Text style={styles.readoutText}>
              {leader
                ? `${leader.outletName} is your strongest branch per hour it trades.`
                : "No branch is clearing every benchmark yet."}
              {needsAttention > 0
                ? ` ${formatCount(needsAttention)} ${needsAttention === 1 ? "branch needs" : "branches need"} attention.`
                : ""}
            </Text>
          </View>

          <Text style={styles.eyebrow}>Ranked by revenue per trading hour</Text>

          {branchRows.map((row) => (
            <BranchPerformanceCard
              key={row.outletId}
              row={row}
              onPress={() => openBranch(row.outletId as string, row.outletName)}
            />
          ))}

          <Text style={styles.eyebrow}>When the store is busy</Text>
          <Card>
            <HourVolumeChart hours={hours} />
          </Card>
        </>
      )}

      {/* Named rather than hidden: without this the branch figures look like
          they are missing revenue with no explanation. */}
      {unassignedRow && (
        <>
          <Text style={styles.eyebrow}>Not attributed to a branch</Text>
          <BranchPerformanceCard row={unassignedRow} />
        </>
      )}

      <Text style={styles.note}>
        Based on the most recent {formatCount(ORDER_WINDOW)} orders. Trends compare this{" "}
        {periodChoice.label.toLowerCase()} against the {periodChoice.label.toLowerCase()} before it.
        Prime cost and marketing return are not shown because this platform does not hold labour
        hours or ad spend.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { ...typography.title, color: colors.textPrimary },
  periodRow: { flexDirection: "row", gap: spacing.sm },
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
  periodTextActive: { color: colors.textOnDark },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary, marginTop: spacing.xs },
  readout: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  readoutText: { ...typography.caption, color: colors.textPrimary, lineHeight: 19 },
  note: { ...typography.small, color: colors.textTertiary, marginTop: spacing.sm, lineHeight: 16 },
});
