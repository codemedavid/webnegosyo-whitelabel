import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";

import { useSafeQuery } from "../../lib/hooks";
import { formatPeso, formatCount } from "../../lib/format";
import { compareBranches, type AnalyticsOrderLike } from "../../lib/branch-analytics";
import { buildPortfolioRows, storeTotals, type PortfolioRow } from "../../lib/portfolio-rows";
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

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/**
 * How many recent orders the figures are derived from. On Convex the branch
 * lives in an unindexed `customerData` blob, so it cannot be grouped in the
 * query — the same ceiling `branches.tsx` and the dashboard's branch tiles
 * accept. It is stated on screen rather than left to be discovered.
 */
const ORDER_WINDOW = 2000;

/**
 * The owner's first screen: what the whole store took, and how each branch
 * contributed.
 *
 * Tapping a branch is the point of the screen. It sets the viewing context,
 * which narrows Operations, Register, Insights and Products to that branch
 * until the owner leaves it — so from here the owner runs one branch as if it
 * were the whole store, then comes back and picks another.
 *
 * The rows are scoped by `useAccountBranchScope`, deliberately not
 * `useBranchScope`: the latter is already narrowed to the branch being viewed,
 * which would collapse this list to the single row the owner drilled into and
 * leave no way back.
 */
export default function PortfolioScreen() {
  const scope = useAccountBranchScope();
  const [refreshing, setRefreshing] = useState(false);

  const { outlets, isLoading: outletsLoading, error: outletsError, reload } = useOutlets();
  const { data: orders, error: ordersError } = useSafeQuery<AnalyticsOrderLike[]>(getOrdersRef, {
    limit: ORDER_WINDOW,
  });

  const selectBranch = useBranchContextStore((s) => s.selectBranch);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const rows = useMemo(() => {
    const scoped = filterOrdersToScope(scope, orders) as AnalyticsOrderLike[];
    return buildPortfolioRows(outlets, compareBranches(scoped));
  }, [scope, orders, outlets]);

  const totals = useMemo(() => storeTotals(rows), [rows]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
    // The order query pushes fresh data on its own; the gesture is an
    // affordance for the branch list, which does not.
    setTimeout(() => setRefreshing(false), 600);
  }, [reload]);

  const openBranch = useCallback(
    (row: PortfolioRow) => {
      // Unassigned is a data-quality bucket, not a branch: there is nothing to
      // run, and a scope built from it would match orders no branch owns.
      if (row.outletId === null) return;

      selectBranch(row.outletId, row.outletName);
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

      <Card>
        <Text style={styles.totalsLabel}>Store total</Text>
        <Text style={styles.totalsValue}>{formatPeso(totals.revenue)}</Text>
        <Text style={styles.totalsMeta}>
          {formatCount(totals.orderCount)} orders across {formatCount(outlets.length)} branches
        </Text>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No branches yet. Add one to see how each location is doing." />
        </Card>
      ) : (
        rows.map((row) => {
          const isUnassigned = row.outletId === null;
          return (
            <TouchableOpacity
              key={row.outletId ?? "unassigned"}
              activeOpacity={isUnassigned ? 1 : 0.7}
              onPress={() => openBranch(row)}
              disabled={isUnassigned}
              accessibilityRole={isUnassigned ? "text" : "button"}
              accessibilityLabel={
                isUnassigned
                  ? `Unassigned takings, ${formatPeso(row.revenue)}`
                  : `Open ${row.outletName}. ${formatPeso(row.revenue)} from ${formatCount(row.orderCount)} orders`
              }
            >
              <Card>
                <View style={styles.rowHeader}>
                  <Text
                    style={isUnassigned ? styles.branchNameMuted : styles.branchName}
                    numberOfLines={1}
                  >
                    {row.outletName}
                  </Text>
                  {isUnassigned ? (
                    <Text style={styles.share}>{Math.round(row.revenueShare * 100)}%</Text>
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </View>

                <View style={styles.figures}>
                  <View style={styles.figure}>
                    <Text style={styles.figureLabel}>Revenue</Text>
                    <Text style={styles.figureValue}>{formatPeso(row.revenue)}</Text>
                  </View>
                  <View style={styles.figure}>
                    <Text style={styles.figureLabel}>Orders</Text>
                    <Text style={styles.figureValue}>{formatCount(row.orderCount)}</Text>
                  </View>
                  <View style={styles.figure}>
                    <Text style={styles.figureLabel}>Avg order</Text>
                    <Text style={styles.figureValue}>{formatPeso(row.averageOrderValue)}</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })
      )}

      {rows.some((row) => row.outletId === null) && (
        <Text style={styles.note}>
          Unassigned covers orders taken before branches were switched on, and any order that did
          not record which branch fulfilled it. They still count toward your store total.
        </Text>
      )}

      <Text style={styles.note}>Based on the most recent {formatCount(ORDER_WINDOW)} orders.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: { ...typography.title, color: colors.textPrimary },
  totalsLabel: { ...typography.eyebrow, color: colors.textSecondary },
  totalsValue: { ...typography.title, color: colors.textPrimary, marginTop: 2 },
  totalsMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  branchName: { ...typography.heading, color: colors.textPrimary, flexShrink: 1 },
  branchNameMuted: { ...typography.heading, color: colors.textSecondary, flexShrink: 1 },
  chevron: { fontSize: 22, color: colors.textSecondary, marginLeft: spacing.sm },
  share: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  figures: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  figure: { flex: 1 },
  figureLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  figureValue: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
