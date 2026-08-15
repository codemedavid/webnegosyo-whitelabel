import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useBranchScope } from "../../lib/use-branch-scope";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { OrderCard, type OrderCardOrder } from "../../components/OrderCard";
import { OrderFilterBar, type SortOrder, type StatusFilterOption } from "../../components/OrderFilterBar";
import { useOrderPrint } from "../../hooks/useOrderPrint";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { restoreStockForStatusChange } from "../../lib/order-cancel-stock";
import { pushConfirmedOrderToLoyverse } from "../../lib/loyverse-confirm";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";
type FilterKey = OrderStatus | "all";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const STATUS_FILTERS: FilterKey[] = [
  "all",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
];

interface ConvexOrder extends OrderCardOrder {
  customerContact: string;
  status: OrderStatus;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function OrdersScreen() {
  const params = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState<FilterKey>(
    STATUS_FILTERS.includes(params.status as FilterKey) ? (params.status as FilterKey) : "all"
  );
  const [sort, setSort] = useState<SortOrder>("newest");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Deep link from the dashboard pipeline (`/orders?status=preparing`). The tab
  // stays mounted, so sync the filter whenever the param changes.
  useEffect(() => {
    if (params.status && STATUS_FILTERS.includes(params.status as FilterKey)) {
      setFilter(params.status as FilterKey);
    }
  }, [params.status]);

  // Fetch the full recent queue once, then filter/search/sort on the client so
  // every status pill can show a live count without extra round-trips.
  const { data: orders, isLoading, error } = useSafeQuery<ConvexOrder[]>(getOrdersRef, {});
  const scope = useBranchScope();
  const updateStatus = useSafeMutation(updateOrderStatusRef);
  const { shouldPrint } = useOrderPrint();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // A branch account sees only its own branch's orders. Filtering here — before
  // the counts, search and sort are computed — keeps the status pill counts
  // describing the same list the merchant is looking at.
  const allOrders = useMemo(
    () => filterOrdersToScope(scope, orders) as ConvexOrder[],
    [scope, orders],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: allOrders.length };
    for (const order of allOrders) {
      map[order.status] = (map[order.status] ?? 0) + 1;
    }
    return map;
  }, [allOrders]);

  const filterOptions: StatusFilterOption[] = STATUS_FILTERS.map((key) => ({
    key,
    label: key === "all" ? "All" : capitalize(key),
    count: counts[key] ?? 0,
  }));

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = allOrders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!query) return true;
      return (
        order.customerName.toLowerCase().includes(query) ||
        (order.customerContact ?? "").toLowerCase().includes(query)
      );
    });
    return filtered.sort((a, b) =>
      sort === "newest" ? b._creationTime - a._creationTime : a._creationTime - b._creationTime
    );
  }, [allOrders, filter, search, sort]);

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    try {
      await updateStatus({ orderId, status: newStatus });
      // Put the ingredients back on a cancel — the same shared side-effect the
      // detail screen runs. Never throws, so a stock write cannot make an
      // order un-cancellable from the queue.
      await restoreStockForStatusChange(newStatus, String(orderId));

      // Push the confirmed order into Loyverse — the same shared side-effect
      // the detail screen runs. Only the id travels: this list holds no line
      // items, so the server reads them back out of the order backend.
      if (newStatus === "confirmed") {
        await pushConfirmedOrderToLoyverse(String(orderId));
      }

      // Printing needs those same missing line items — a receipt emitted here
      // would have nothing on it. Point at the screen that has them, but only
      // when the merchant actually expects paper.
      if (newStatus === "confirmed" && shouldPrint("confirmation")) {
        Alert.alert("Order Confirmed", "Open order details to print receipt.");
      }
    } catch {
      Alert.alert("Error", "Failed to update order status");
    }
  };

  const confirmCancel = (order: ConvexOrder) => {
    Alert.alert(
      "Cancel this order?",
      "It will be removed from the active queue and excluded from revenue.",
      [
        { text: "Keep Order", style: "cancel" },
        {
          text: "Cancel Order",
          onPress: () => handleUpdateStatus(order._id, "cancelled"),
          style: "destructive",
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Order Queue</Text>
          <Text style={styles.title}>Orders</Text>
        </View>
        <View style={styles.headerActions}>
          <WorkspaceSwitcher />
          <TouchableOpacity
            onPress={() => router.push("/(main)/scan")}
            style={styles.scanButton}
            activeOpacity={0.8}
          >
            <Text style={styles.scanButtonText}>Scan QR</Text>
          </TouchableOpacity>
        </View>
      </View>

      <OrderFilterBar
        filters={filterOptions}
        activeFilter={filter}
        onFilterChange={(key) => setFilter(key as FilterKey)}
        sort={sort}
        onSortToggle={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
        search={search}
        onSearchChange={setSearch}
      />

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {error ? (
          <ErrorState message={error} onRetry={() => setFilter("all")} />
        ) : isLoading ? (
          <LoadingState message="Loading orders..." />
        ) : visibleOrders.length === 0 ? (
          <EmptyState message={search ? "No orders match your search" : "No orders found"} />
        ) : (
          visibleOrders.map((order) => {
            const nextStatus = NEXT_STATUS[order.status];
            const canCancel = order.status !== "delivered" && order.status !== "cancelled";
            return (
              <OrderCard
                key={order._id}
                order={order}
                onPress={() => router.push(`/(main)/order/${order._id}`)}
                nextStatusLabel={nextStatus ? capitalize(nextStatus) : undefined}
                onAdvance={nextStatus ? () => handleUpdateStatus(order._id, nextStatus) : undefined}
                onCancel={canCancel ? () => confirmCancel(order) : undefined}
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.md,
  },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary, marginBottom: spacing.xs },
  title: { ...typography.title, color: colors.textPrimary },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  scanButtonText: { ...typography.caption, color: colors.textOnDark, fontWeight: "600" },
  list: { flex: 1, marginTop: spacing.md },
  listContent: { padding: spacing.xl, paddingTop: spacing.sm },
});
