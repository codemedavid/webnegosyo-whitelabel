import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { summarizeCounterSales, type CounterSale } from "../../lib/pos-sales";
import { readPosPayment } from "../../lib/pos-order";
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

/** Orders are fetched newest-first; this caps the read for a single shift. */
const SHIFT_ORDER_LIMIT = 200;

/** Start of today in the device's local timezone. */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export default function PosSalesScreen() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const { data, isLoading } = useSafeQuery<CounterSale[]>(getOrdersRef, {
    limit: SHIFT_ORDER_LIMIT,
  });

  const todaysSales = useMemo(() => {
    const since = startOfToday();
    return (data ?? []).filter(
      (order) => order.source === "pos" && order._creationTime >= since,
    );
  }, [data]);

  const summary = useMemo(() => summarizeCounterSales(todaysSales), [todaysSales]);

  if (!convexUrl) {
    return (
      <View style={styles.center}>
        <EmptyState message="POS is not available yet — this store's order backend is not configured." />
      </View>
    );
  }

  if (isLoading) return <LoadingState />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <Text style={styles.eyebrow}>Today at the register</Text>

      <View style={styles.drawer}>
        <Text style={styles.drawerLabel}>Expected in drawer</Text>
        <Text style={styles.drawerAmount}>{formatPeso(summary.cashTotal)}</Text>
        <Text style={styles.drawerHint}>
          Cash sales before {formatPeso(summary.changeGiven)} change handed out
        </Text>
      </View>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Sales</Text>
          <Text style={styles.statValue}>{summary.saleCount}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Gross</Text>
          <Text style={styles.statValue}>{formatPeso(summary.grossTotal)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Non-cash</Text>
          <Text style={styles.statValue}>{formatPeso(summary.nonCashTotal)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Sales</Text>
      {todaysSales.length === 0 ? (
        <EmptyState message="No counter sales yet today." />
      ) : (
        todaysSales.map((sale) => {
          const payment = readPosPayment(sale.customerData);
          return (
            <TouchableOpacity
              key={sale._id}
              style={styles.sale}
              onPress={() => router.push(`/(main)/order/${sale._id}`)}
            >
              <View style={styles.saleText}>
                <Text style={styles.saleTime}>
                  {new Date(sale._creationTime).toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <Text style={styles.saleMeta}>
                  {sale.paymentMethod ?? "Unrecorded"}
                  {payment?.changeDue !== undefined
                    ? `  ·  ${formatPeso(payment.changeDue)} change`
                    : ""}
                </Text>
              </View>
              <Text style={styles.saleTotal}>{formatPeso(sale.total)}</Text>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  drawer: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xxl,
  },
  drawerLabel: { ...typography.eyebrow, color: colors.tabBarInactive },
  drawerAmount: { fontSize: 36, fontWeight: "800", color: colors.textOnDark, marginTop: spacing.xs },
  drawerHint: { ...typography.small, color: colors.tabBarInactive, marginTop: spacing.xs },
  statRow: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  statLabel: { ...typography.small, color: colors.textSecondary },
  statValue: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.xs },
  sectionTitle: { ...typography.eyebrow, color: colors.textSecondary, marginTop: spacing.lg },
  sale: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  saleText: { flex: 1 },
  saleTime: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  saleMeta: { ...typography.small, color: colors.textSecondary },
  saleTotal: { ...typography.heading, color: colors.textPrimary },
});
