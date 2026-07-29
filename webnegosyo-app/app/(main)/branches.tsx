import React, { useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { formatPeso, formatCount } from "../../lib/format";
import { compareBranches, type AnalyticsOrderLike } from "../../lib/branch-analytics";
import { useAccountBranchScope } from "../../lib/use-branch-scope";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../../components/Card";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/**
 * How many recent orders the comparison is derived from. The branch lives in
 * an unindexed `customerData` blob, so it cannot be grouped in the query —
 * the same ceiling the dashboard's branch tiles accept. Past this many orders
 * the figures under-report, which is why it is stated on screen rather than
 * left for the merchant to discover.
 */
const ORDER_WINDOW = 2000;

/**
 * Branch-versus-branch takings.
 *
 * The comparison exists for the owner: a branch-locked account is filtered to
 * its own branch by `useAccountBranchScope`, so it sees one row — its own —
 * rather than everyone else's numbers. The *account* scope, not the narrowed
 * one: an owner who has drilled into a branch still needs every branch here,
 * since comparing is the entire purpose of the screen.
 *
 * Cancelled orders are excluded from revenue and count in `compareBranches`,
 * so these figures describe the same set of orders as the dashboard tiles.
 */
export default function BranchesScreen() {
  const scope = useAccountBranchScope();
  const [refreshing, setRefreshing] = useState(false);

  const { data: orders, error } = useSafeQuery<AnalyticsOrderLike[]>(getOrdersRef, {
    limit: ORDER_WINDOW,
  });

  const rows = useMemo(() => {
    if (!orders) return [];
    return compareBranches(filterOrdersToScope(scope, orders) as AnalyticsOrderLike[]);
  }, [scope, orders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Convex pushes fresh data on its own; the gesture is an affordance.
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  if (error) return <ErrorState message="Could not load branch performance" />;
  if (orders === undefined) return <LoadingState />;

  const hasUnassigned = rows.some((row) => row.outletId === null);

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

      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No orders yet. Branch takings appear here once orders come in." />
        </Card>
      ) : (
        <>
          {rows.map((row) => (
            <Card key={row.outletId ?? "unassigned"}>
              <View style={styles.rowHeader}>
                <Text
                  style={row.outletId === null ? styles.branchNameMuted : styles.branchName}
                  numberOfLines={1}
                >
                  {row.outletName}
                </Text>
                <Text style={styles.share}>{Math.round(row.revenueShare * 100)}%</Text>
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
          ))}

          {/* Named rather than hidden: without this the branch figures look
              like they are missing revenue with no explanation. */}
          {hasUnassigned && (
            <Text style={styles.note}>
              Unassigned covers orders taken before branches were switched on, and any order that
              did not record which branch fulfilled it. They still count toward your store total.
            </Text>
          )}

          <Text style={styles.note}>
            Based on the most recent {formatCount(ORDER_WINDOW)} orders.
          </Text>
        </>
      )}
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
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  branchName: { ...typography.heading, color: colors.textPrimary, flexShrink: 1 },
  branchNameMuted: { ...typography.heading, color: colors.textSecondary, flexShrink: 1 },
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
