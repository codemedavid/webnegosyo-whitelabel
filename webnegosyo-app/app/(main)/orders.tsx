import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { FunctionReference } from "convex/server";
import { router } from "expo-router";
import { useSafeQuery, useSafeMutation } from "../../lib/hooks";
import { formatPeso } from "../../lib/format";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Badge } from "../../components/Badge";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useOrderPrint } from "../../hooks/useOrderPrint";
import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";


const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const STATUS_FILTERS: (OrderStatus | "all")[] = ["all", "pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];

interface ConvexOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  total: number;
  itemCount: number;
  orderType?: string;
  status: OrderStatus;
  source?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryAddress?: string;
  lalamoveStatus?: string;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function OrdersScreen() {
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [refreshing, setRefreshing] = useState(false);
  const { data: orders, isLoading, error } = useSafeQuery<ConvexOrder[]>(getOrdersRef, filter === "all" ? {} : { status: filter });
  const updateStatus = useSafeMutation(updateOrderStatusRef);
  const { autoPrint, hasPrinter } = useOrderPrint();

  // Orders stream in live via Convex; pull-to-refresh just acknowledges the gesture.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    try {
      await updateStatus({ orderId, status: newStatus });
      if (newStatus === "confirmed" && autoPrint && hasPrinter) {
        Alert.alert("Order Confirmed", "Open order details to print receipt.");
      }
    } catch {
      Alert.alert("Error", "Failed to update order status");
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <TouchableOpacity
          onPress={() => router.push("/(main)/scan")}
          style={styles.scanButton}
          activeOpacity={0.8}
        >
          <Text style={styles.scanButtonText}>⧉ Scan QR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_FILTERS.map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterPill, filter === status && styles.filterPillActive]}
            onPress={() => setFilter(status)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, filter === status && styles.filterTextActive]}>
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {error ? (
          <ErrorState message={error} onRetry={() => setFilter("all")} />
        ) : isLoading ? (
          <LoadingState message="Loading orders..." />
        ) : (orders ?? []).length === 0 ? (
          <EmptyState message="No orders found" />
        ) : (
          (orders ?? []).map((order) => {
            const nextStatus = NEXT_STATUS[order.status];

            return (
              <TouchableOpacity
                key={order._id}
                style={styles.orderCard}
                onPress={() => router.push(`/(main)/order/${order._id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.orderTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderName}>{order.customerName}</Text>
                    <Text style={styles.orderContact}>{order.customerContact}</Text>
                  </View>
                  <View style={styles.orderRight}>
                    <Text style={styles.orderTotal}>{formatPeso(order.total)}</Text>
                    <Badge label={order.status} variant={order.status} />
                  </View>
                </View>

                <View style={styles.orderBottom}>
                  {order.orderType && (
                    <View style={styles.orderTypePill}>
                      <Text style={styles.orderTypeText}>{order.orderType}</Text>
                    </View>
                  )}
                  <Text style={styles.orderMeta}>
                    {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · {order.source ?? "web"} · {timeAgo(order._creationTime)}
                  </Text>
                </View>

                {nextStatus && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleUpdateStatus(order._id, nextStatus)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionText}>
                      Mark as {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                    </Text>
                  </TouchableOpacity>
                )}

                {order.status !== "delivered" && order.status !== "cancelled" && (
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel order for ${order.customerName}`}
                    onPress={() => {
                      Alert.alert(
                        "Cancel this order?",
                        "It will be removed from the active queue and excluded from revenue.",
                        [
                          { text: "Keep Order", style: "cancel" },
                          { text: "Cancel Order", onPress: () => handleUpdateStatus(order._id, "cancelled"), style: "destructive" },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  scanButtonText: { ...typography.caption, color: "#FFFFFF", fontWeight: "600" },
  filterScroll: { maxHeight: 44 },
  filterContent: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  filterTextActive: { color: "#FFFFFF" },
  list: { flex: 1 },
  listContent: { padding: spacing.xl, paddingTop: spacing.md },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  orderTop: { flexDirection: "row", justifyContent: "space-between" },
  orderName: { ...typography.heading, color: colors.textPrimary },
  orderContact: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  orderRight: { alignItems: "flex-end", gap: spacing.xs },
  orderTotal: { ...typography.heading, color: colors.primary },
  orderBottom: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.separator, flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  orderTypePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}15`,
  },
  orderTypeText: { ...typography.small, color: colors.primary, fontWeight: "700", textTransform: "uppercase" },
  orderMeta: { ...typography.caption, color: colors.textSecondary },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: spacing.md,
  },
  actionText: { ...typography.body, color: "#FFFFFF", fontWeight: "600" },
  cancelText: { ...typography.caption, color: colors.danger, textAlign: "center", marginTop: spacing.sm, paddingVertical: spacing.xs },
});
