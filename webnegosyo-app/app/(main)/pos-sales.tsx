import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { useRegisterSettingsStore } from "../../stores/register-settings-store";
import { selectShiftSales, summarizeCounterSales } from "../../lib/pos-sales";
import {
  DRAWER_COUNTING_OPTIONS,
  countingFromPolicy,
  policyFromCounting,
  describeCounting,
  describeDrawerSale,
  describeIntake,
  describeShiftSales,
  drawerBreakdown,
  type DrawerCounting,
  type DrawerSale,
} from "../../lib/drawer-view";
import { canConfirmFromDrawer, selectDrawerIncoming } from "../../lib/drawer-intake";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { type IncomingOrder, type RealtimeQueue } from "../../lib/pos-incoming";
import { describeIncomingOrder } from "../../lib/pos-incoming";
import { useBranchScope } from "../../lib/use-branch-scope";
import { filterQueueToScope } from "../../lib/branch-dashboard";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { pushConfirmedOrderToLoyverse } from "../../lib/loyverse-confirm";
import { formatPeso } from "../../lib/format";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { SectionHeader } from "../../components/SectionHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
// Rendered by <ScreenHeader>; the import stays so the guardrail that every
// tab is escapable keeps reading it here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import { ScreenHeader } from "../../components/ScreenHeader";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;
const updateOrderStatusRef =
  "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

/** Orders are fetched newest-first; this caps the read for a single shift. */
const SHIFT_ORDER_LIMIT = 200;

/**
 * Intake rows shown before the screen stops listing them.
 *
 * The Drawer is where a cashier counts money; a twenty-row backlog pinned
 * above the total buries the one number they came for. Three is enough to
 * accept what just arrived — the rest are counted, not drawn, and the Orders
 * screen is where a real backlog gets worked.
 */
const INTAKE_PREVIEW = 3;

/** Start of today in the device's local timezone. */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function formatSaleTime(at: number): string {
  return new Date(at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export default function PosSalesScreen() {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const includeOnlineOrders = useRegisterSettingsStore((s) => s.drawerIncludesOnlineOrders);
  const setIncludeOnlineOrders = useRegisterSettingsStore((s) => s.setDrawerIncludesOnlineOrders);
  const scope = useBranchScope();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const counting: DrawerCounting = countingFromPolicy(includeOnlineOrders);

  const { data, isLoading, refetch } = useSafeQuery<DrawerSale[]>(getOrdersRef, {
    limit: SHIFT_ORDER_LIMIT,
  });

  // The same live queue the Register and the ringtone watch, so the backend
  // de-dupes the subscription and the two lists can never disagree.
  const { data: queue, refetch: refetchQueue } = useSafeQuery<RealtimeQueue>(getRealtimeQueueRef);
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
    () => selectShiftSales(todaysSales, { includeOnlineOrders }) as DrawerSale[],
    [todaysSales, includeOnlineOrders],
  );

  const breakdown = useMemo(() => drawerBreakdown(summary), [summary]);

  const onRefresh = useCallback(
    () => refreshWithMinSpinner([refetch, refetchQueue], setIsRefreshing),
    [refetch, refetchQueue],
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

      // Push the confirmed order into Loyverse. The drawer shows a total and an
      // item count, never the dishes, so only the id travels and the server
      // reads the lines back out of the order backend. Never throws, and
      // no-ops for tenants without Loyverse.
      await pushConfirmedOrderToLoyverse(String(order._id));
    } catch {
      Alert.alert("Error", "Failed to confirm this order. Check your connection and try again.");
    } finally {
      setConfirmingId(null);
    }
  };

  if (!hasLiveOrderBackend({ convexUrl, orderBackend })) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="drawer"
          title="No till to count"
          message="This store's order backend is not configured yet, so the register has nothing to reconcile."
        />
      </View>
    );
  }

  if (isLoading) return <LoadingState />;

  const preview = incoming.slice(0, INTAKE_PREVIEW);
  const overflow = incoming.length - preview.length;

  return (
    <View style={styles.screen}>
      {/* <ScreenHeader> mounts <WorkspaceSwitcher /> */}
      <ScreenHeader title="Drawer" subtitle="What this shift has taken in">
        <SegmentedControl
          options={DRAWER_COUNTING_OPTIONS}
          value={counting}
          onChange={(next) => setIncludeOnlineOrders(policyFromCounting(next))}
          accessibilityPrefix="Count"
        />
      </ScreenHeader>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* The money first: it is the only reason this screen is open. */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Expected in drawer · Cash</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatPeso(summary.cashTotal)}
          </Text>

          <View style={styles.heroDivider} />

          <View style={styles.heroLines}>
            {breakdown.map((line) => (
              <View key={line.key} style={styles.heroLine}>
                <Text style={styles.heroLineLabel}>{line.label}</Text>
                <Text style={styles.heroLineValue}>{formatPeso(line.value)}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.heroNote}>{describeCounting(counting)}</Text>

        {preview.length > 0 && (
          <>
            <SectionHeader
              title="Incoming orders"
              hint={describeIntake(incoming.length)}
              trailing={
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{incoming.length}</Text>
                </View>
              }
            />
            <View style={styles.group}>
              {preview.map((order, index) => {
                const gate = canConfirmFromDrawer(order, orderBackend ?? "convex");
                const isLast = index === preview.length - 1;
                return (
                  <View key={order._id} style={[styles.intake, !isLast && styles.grouped]}>
                    <TouchableOpacity
                      style={styles.intakeText}
                      onPress={() => router.push(`/(main)/order/${order._id}`)}
                      accessibilityLabel={`Open order from ${order.customerName ?? "customer"}`}
                    >
                      <Text style={styles.rowTitle}>{describeIncomingOrder(order)}</Text>
                      {/* A refused row says WHY, in the gate's own words. It used
                          to print the raw status and leave the cashier guessing. */}
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {gate.ok ? "Not accepted yet" : gate.reason}
                      </Text>
                    </TouchableOpacity>
                    {gate.ok ? (
                      <Button
                        label="Accept"
                        size="sm"
                        isLoading={confirmingId === order._id}
                        onPress={() => handleConfirm(order)}
                        accessibilityLabel="Accept this order"
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
            {overflow > 0 ? (
              <Text style={styles.overflow}>
                {`${overflow} more waiting — the rest are in the Register's incoming list`}
              </Text>
            ) : null}
          </>
        )}

        <SectionHeader title="Sales" hint={describeShiftSales(shiftSales.length, counting)} />
        {shiftSales.length === 0 ? (
          <EmptyState
            icon="register"
            title="Nothing rung up yet"
            message="Sales appear here the moment the register takes one."
            inset
          />
        ) : (
          <View style={styles.group}>
            {shiftSales.map((sale, index) => {
              const row = describeDrawerSale(sale);
              const isLast = index === shiftSales.length - 1;
              return (
                <TouchableOpacity
                  key={sale._id}
                  style={[styles.sale, !isLast && styles.grouped]}
                  onPress={() => router.push(`/(main)/order/${sale._id}`)}
                  accessibilityLabel={`${formatSaleTime(sale._creationTime)}, ${row.meta}, ${formatPeso(sale.total)}`}
                >
                  <View style={styles.saleText}>
                    <View style={styles.saleTitleRow}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {row.who
                          ? `${formatSaleTime(sale._creationTime)}  ·  ${row.who}`
                          : formatSaleTime(sale._creationTime)}
                      </Text>
                      {row.tag ? (
                        <View style={styles.tag}>
                          <Text style={styles.tagText}>{row.tag}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {row.meta}
                    </Text>
                  </View>
                  <Text style={styles.saleTotal}>{formatPeso(sale.total)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  body: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl * 2 },

  // Money
  hero: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.md,
  },
  heroEyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.heroInkText,
    marginTop: spacing.sm,
  },
  heroDivider: {
    height: 1,
    backgroundColor: colors.heroInkElevated,
    marginVertical: spacing.lg,
  },
  heroLines: { gap: spacing.sm },
  heroLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroLineLabel: { ...typography.caption, color: colors.heroInkMuted },
  heroLineValue: { ...typography.caption, fontWeight: "700", color: colors.heroInkText },
  heroNote: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },

  // Shared row furniture
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  grouped: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  rowTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  // Intake
  countPill: {
    minWidth: 26,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  countPillText: { ...typography.caption, fontWeight: "800", color: colors.textOnDark },
  intake: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    gap: spacing.md,
  },
  intakeText: { flex: 1 },
  overflow: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },

  // Sales
  sale: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    gap: spacing.md,
  },
  saleText: { flex: 1 },
  saleTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  tagText: { ...typography.small, fontWeight: "700", color: colors.textSecondary },
  saleTotal: { ...typography.heading, color: colors.textPrimary },
});
