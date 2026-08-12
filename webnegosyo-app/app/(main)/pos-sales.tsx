import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { useRegisterSettingsStore } from "../../stores/register-settings-store";
import { selectShiftSales, summarizeCounterSales, type CounterSale } from "../../lib/pos-sales";
import { canConfirmFromDrawer, selectDrawerIncoming } from "../../lib/drawer-intake";
import { type IncomingOrder, type RealtimeQueue } from "../../lib/pos-incoming";
import { describeIncomingOrder } from "../../lib/pos-incoming";
import { useBranchScope } from "../../lib/use-branch-scope";
import { filterQueueToScope } from "../../lib/branch-scope";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { readPosPayment } from "../../lib/pos-order";
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;
const updateOrderStatusRef =
  "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

/** Orders are fetched newest-first; this caps the read for a single shift. */
const SHIFT_ORDER_LIMIT = 200;

/** Start of today in the device's local timezone. */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export default function PosSalesScreen() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const includeOnlineOrders = useRegisterSettingsStore((s) => s.drawerIncludesOnlineOrders);
  const setIncludeOnlineOrders = useRegisterSettingsStore((s) => s.setDrawerIncludesOnlineOrders);
  const scope = useBranchScope();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data, isLoading } = useSafeQuery<CounterSale[]>(getOrdersRef, {
    limit: SHIFT_ORDER_LIMIT,
  });

  // The same live queue the Register and the ringtone watch, so the backend
  // de-dupes the subscription and the two lists can never disagree.
  const { data: queue } = useSafeQuery<RealtimeQueue>(getRealtimeQueueRef);
  const updateStatus = useSafeMutation(updateOrderStatusRef);

  // A branch cashier accepts only their own branch's orders.
  const incoming = useMemo(
    () =>
      selectDrawerIncoming(
        filterQueueToScope(scope, queue as Record<string, IncomingOrder[]> | undefined),
      ),
    [scope, queue],
  );

  // Which rows count toward this shift is the pure core's call; the screen only
  // narrows to today and hands over the merchant's opt-in.
  const todaysSales = useMemo(() => {
    const since = startOfToday();
    return (data ?? []).filter((order) => order._creationTime >= since);
  }, [data]);

  const summary = useMemo(
    () => summarizeCounterSales(todaysSales, [], { includeOnlineOrders }),
    [todaysSales, includeOnlineOrders],
  );

  // Same predicate the summary uses, so the list can never show a row the
  // totals ignored.
  const shiftSales = useMemo(
    () => selectShiftSales(todaysSales, { includeOnlineOrders }),
    [todaysSales, includeOnlineOrders],
  );

  const handleConfirm = async (order: IncomingOrder) => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }

    const gate = canConfirmFromDrawer(order, orderBackend ?? "convex");
    if (!gate.ok) {
      Alert.alert("Cannot confirm", gate.reason);
      return;
    }

    setConfirmingId(order._id);
    try {
      await updateStatus({ orderId: order._id, status: "confirmed" });
    } catch {
      Alert.alert("Error", "Failed to confirm this order. Check your connection and try again.");
    } finally {
      setConfirmingId(null);
    }
  };

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
      <View style={styles.headerRow}>
        <WorkspaceSwitcher />
        <Text style={styles.eyebrow}>Today at the register</Text>
      </View>

      {incoming.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Incoming orders</Text>
          {incoming.map((order) => {
            const gate = canConfirmFromDrawer(order, orderBackend ?? "convex");
            return (
              <View key={order._id} style={styles.incoming}>
                <TouchableOpacity
                  style={styles.incomingText}
                  onPress={() => router.push(`/(main)/order/${order._id}`)}
                  accessibilityLabel={`Open order from ${order.customerName ?? "customer"}`}
                >
                  <Text style={styles.saleTime}>{describeIncomingOrder(order)}</Text>
                  <Text style={styles.saleMeta}>
                    {order.status === "pending" ? "Waiting for confirmation" : `Status: ${order.status}`}
                  </Text>
                </TouchableOpacity>
                {gate.ok ? (
                  <TouchableOpacity
                    style={styles.confirmButton}
                    disabled={confirmingId === order._id}
                    onPress={() => handleConfirm(order)}
                    accessibilityLabel="Confirm this order"
                  >
                    <Text style={styles.confirmLabel}>
                      {confirmingId === order._id ? "…" : "Confirm"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.incomingStatus}>{order.status}</Text>
                )}
              </View>
            );
          })}
        </>
      )}

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

      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleLabel}>Count Smart Menu orders</Text>
          <Text style={styles.toggleSub}>
            Include online orders confirmed here, using what has actually been paid
          </Text>
        </View>
        <Switch
          value={includeOnlineOrders}
          onValueChange={setIncludeOnlineOrders}
          trackColor={{ true: colors.primary }}
          accessibilityLabel="Count Smart Menu orders in the drawer"
        />
      </View>

      <Text style={styles.sectionTitle}>Sales</Text>
      {shiftSales.length === 0 ? (
        <EmptyState message="No counter sales yet today." />
      ) : (
        shiftSales.map((sale) => {
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
  body: { padding: spacing.xl, paddingTop: 60, gap: spacing.md },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
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
  incoming: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  incomingText: { flex: 1 },
  incomingStatus: { ...typography.small, color: colors.textSecondary },
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  confirmLabel: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  toggleText: { flex: 1 },
  toggleLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  toggleSub: { ...typography.small, color: colors.textSecondary },
});
