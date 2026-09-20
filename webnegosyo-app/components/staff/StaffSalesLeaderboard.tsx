import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { FunctionReference } from "convex/server";

import { buildKpiPeriod } from "../../lib/branch-period";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { formatPeso } from "../../lib/format";
import { useSafeQuery } from "../../lib/hooks";
import type { CounterSale } from "../../lib/pos-sales";
import { summarizeStaffPerformance } from "../../lib/staff-analytics";
import type { StaffMember } from "../../lib/staff-service";
import { useAuthStore } from "../../stores/auth-store";
import { useBranchScope } from "../../lib/use-branch-scope";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { LoadingState } from "../LoadingState";
import { OrderSettlementReader } from "../OrderSettlementReader";
import { SegmentedControl } from "../SegmentedControl";
import { StaffAvatar } from "./StaffAvatar";

/**
 * Whose register took what.
 *
 * Counter sales only, like the personal drawer: an online order is the
 * store's work, not a register's, and crediting it to whoever tapped Confirm
 * would let the fastest Confirm-tapper win the leaderboard. Who confirmed
 * what is a real question, and it is answered on each person's own screen.
 *
 * The figures are `staff-analytics.ts`'s, which is `pos-sales.ts`'s
 * arithmetic per person — so a peso here is the same peso the drawer screen
 * shows the cashier.
 */

const ordersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const LIMIT = 1000;

const PERIODS = [
  { label: "Today", value: 1 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
] as const;

function Row({
  rank,
  name,
  seed,
  saleCount,
  gross,
  cash,
  nonCash,
  average,
}: {
  rank: number;
  name: string;
  seed: string;
  saleCount: number;
  gross: number;
  cash: number;
  nonCash: number;
  average: number;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.lead}>
        <Text style={styles.rank}>{rank}</Text>
        <StaffAvatar name={name} seed={seed} size="sm" />
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {saleCount} {saleCount === 1 ? "sale" : "sales"} · average {formatPeso(average)}
          </Text>
        </View>
        <Text style={styles.gross}>{formatPeso(gross, 0)}</Text>
      </View>
      <Text style={styles.split} numberOfLines={1}>
        Cash {formatPeso(cash)} · Other {formatPeso(nonCash)}
      </Text>
    </View>
  );
}

export function StaffSalesLeaderboard({ staff }: { staff: readonly StaffMember[] }) {
  const isDemo = useAuthStore((state) => state.isDemo);
  const tenantId = useAuthStore((state) => state.impersonatedTenantId ?? state.tenantId);
  const scope = useBranchScope();
  const outletId = scope.kind === "branch" ? scope.outletId : undefined;
  const [days, setDays] = useState<number>(1);
  const period = buildKpiPeriod(days, Date.now());

  const { data, error, isLoading } = useSafeQuery<CounterSale[]>(
    ordersRef,
    isDemo ? "skip" : { limit: LIMIT },
  );
  const orders = useMemo(() => [...filterOrdersToScope(scope, data)], [scope, data]);

  const nameOf = (userId: string) => {
    const member = staff.find((row) => row.userId === userId);
    return member?.displayName ?? member?.email ?? "Former staff";
  };

  return (
    <View style={styles.wrap}>
      <SegmentedControl
        options={PERIODS}
        value={days}
        onChange={setDays}
        accessibilityPrefix="Show"
      />

      {isLoading ? (
        <LoadingState message="Loading sales…" />
      ) : error ? (
        <ErrorState title="Sales unavailable" message={error} />
      ) : (data?.length ?? 0) >= LIMIT ? (
        <ErrorState
          title="Too much history to total"
          message="This report exceeds the order history the app can read at once. Pick a shorter period."
        />
      ) : (
        // Remounted when the store or branch changes (the key), so one scope's
        // ledger reads can never be mistaken for the next one's.
        <OrderSettlementReader
          key={`${tenantId}:${outletId}`}
          ids={orders.map((order) => order._id)}
        >
          {(payments, ready, ledgerError) => {
            if (!ready) {
              return <LoadingState message={ledgerError ?? "Loading settlement history…"} />;
            }
            const result = summarizeStaffPerformance(orders, payments, period);
            if (result.staff.length === 0 && result.unattributed.saleCount === 0) {
              return (
                <EmptyState
                  icon="register"
                  title="No counter sales in this period"
                  message="Sales rung up on the register are credited to whoever was signed in."
                  inset
                />
              );
            }
            return (
              <View style={styles.card}>
                {result.staff.map((row, index) => (
                  <Row
                    key={row.staffUserId}
                    rank={index + 1}
                    name={nameOf(row.staffUserId)}
                    seed={row.staffUserId}
                    saleCount={row.saleCount}
                    gross={row.grossTotal}
                    cash={row.cashTotal}
                    nonCash={row.nonCashTotal}
                    average={row.averageTicket}
                  />
                ))}
                {result.unattributed.saleCount > 0 ? (
                  <Text style={styles.unattributed}>
                    {result.unattributed.saleCount} sales with nobody signed in ·{" "}
                    {formatPeso(result.unattributed.grossTotal, 0)}
                  </Text>
                ) : null}
              </View>
            );
          }}
        </OrderSettlementReader>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  row: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  lead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rank: { ...typography.caption, fontWeight: "700", color: colors.textTertiary, width: 16 },
  identity: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.small, color: colors.textSecondary },
  gross: { ...typography.heading, color: colors.textPrimary },
  split: { ...typography.small, color: colors.textTertiary, marginLeft: 16 + spacing.sm + 36 },
  unattributed: { ...typography.small, color: colors.textSecondary, paddingVertical: spacing.md },
});
