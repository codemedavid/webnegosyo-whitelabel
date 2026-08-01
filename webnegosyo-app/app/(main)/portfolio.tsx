import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";

import { useSafeQuery } from "../../lib/hooks";
import { formatCount } from "../../lib/format";
import { buildBranchKpis, storeKpiTotals, type KpiOrderLike } from "../../lib/branch-kpis";
import { assignBranchVerdicts } from "../../lib/branch-verdict";
import { buildKpiPeriod, PERIOD_CHOICES } from "../../lib/branch-period";
import { useAccountBranchScope } from "../../lib/use-branch-scope";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useOutlets } from "../../lib/use-outlets";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { goTo, type TabAwareRouter } from "../../lib/tab-navigation";
import { colors, typography, spacing } from "../../theme/colors";
import { Card } from "../../components/Card";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { StoreHeroCard } from "../../components/StoreHeroCard";
import { BranchPerformanceCard } from "../../components/BranchPerformanceCard";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/** The same ceiling `branches.tsx` and the dashboard's branch tiles accept. */
const ORDER_WINDOW = 2000;

/** The owner's landing period. Short, because this screen is a daily check-in. */
const LANDING_PERIOD = PERIOD_CHOICES[0];

/**
 * The owner's first screen: what the whole business took, and how each branch
 * contributed.
 *
 * Tapping a branch is the point of the screen. It sets the viewing context,
 * which narrows Operations, Register, Insights and Products to that branch until
 * the owner leaves it — so from here the owner runs one branch as if it were the
 * whole store, then comes back and picks another.
 *
 * It renders the *same* card component and the same KPI math as the Branches
 * screen, on purpose: two owner surfaces showing the same branch with different
 * figures would make both untrustworthy. The difference is depth, not numbers —
 * this screen is fixed to one week and hides the per-branch action sentences,
 * while Branches offers the longer windows and the full readout.
 *
 * Scoped by `useAccountBranchScope`, deliberately not `useBranchScope`: the
 * latter is already narrowed to the branch being viewed, which would collapse
 * this list to the single row the owner drilled into and leave no way back.
 */
export default function PortfolioScreen() {
  const scope = useAccountBranchScope();
  const [refreshing, setRefreshing] = useState(false);

  const { outlets, isLoading: outletsLoading, error: outletsError, reload } = useOutlets();
  const { data: orders, error: ordersError } = useSafeQuery<KpiOrderLike[]>(getOrdersRef, {
    limit: ORDER_WINDOW,
  });

  const selectBranch = useBranchContextStore((s) => s.selectBranch);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const { rows, totals } = useMemo(() => {
    const period = buildKpiPeriod(LANDING_PERIOD.days, Date.now());
    const scoped = filterOrdersToScope(scope, orders) as KpiOrderLike[];
    const kpis = buildBranchKpis(scoped, outlets, period);

    return {
      rows: assignBranchVerdicts(kpis, { periodDays: period.days }),
      totals: storeKpiTotals(kpis),
    };
  }, [scope, orders, outlets]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Your business</Text>
        <WorkspaceSwitcher />
      </View>

      <StoreHeroCard
        totals={totals}
        periodLabel={LANDING_PERIOD.label}
        branchCount={outlets.length}
      />

      {branchRows.length === 0 ? (
        <Card>
          <EmptyState message="No branches yet. Add one to see how each location is doing." />
        </Card>
      ) : (
        <>
          <Text style={styles.eyebrow}>Tap a branch to run it</Text>
          {branchRows.map((row) => (
            <BranchPerformanceCard
              key={row.outletId}
              row={row}
              hideAction
              onPress={() => openBranch(row.outletId as string, row.outletName)}
            />
          ))}
        </>
      )}

      {/* Unassigned is a data-quality bucket, not a branch: there is nothing to
          run, and a scope built from it would match orders no branch owns. */}
      {unassignedRow && <BranchPerformanceCard row={unassignedRow} hideAction />}

      <Text style={styles.note}>
        Last {LANDING_PERIOD.label.toLowerCase()}, from the most recent {formatCount(ORDER_WINDOW)}{" "}
        orders. Open Branches for longer periods and what to do about each one.
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
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary, marginTop: spacing.xs },
  note: { ...typography.small, color: colors.textTertiary, marginTop: spacing.sm, lineHeight: 16 },
});
