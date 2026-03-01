import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { FunctionReference } from "convex/server";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  pending: { bg: "#FEF3C7", text: "#92400E" },
  confirmed: { bg: "#DBEAFE", text: "#1E40AF" },
  preparing: { bg: "#FED7AA", text: "#9A3412" },
  ready: { bg: "#BBF7D0", text: "#166534" },
  delivered: { bg: "#E5E7EB", text: "#374151" },
  cancelled: { bg: "#FECACA", text: "#991B1B" },
};

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

export default function OrdersScreen() {
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const orders = useQuery(getOrdersRef, filter === "all" ? {} : { status: filter }) as ConvexOrder[] | undefined;
  const updateStatus = useMutation(updateOrderStatusRef);

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateStatus({ orderId, status: newStatus });
    } catch {
      Alert.alert("Error", "Failed to update order status");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Orders</Text>

      {/* Status filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {STATUS_FILTERS.map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterTab, filter === status && styles.filterTabActive]}
            onPress={() => setFilter(status)}
          >
            <Text style={[styles.filterText, filter === status && styles.filterTextActive]}>
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {!orders ? (
          <Text style={styles.emptyText}>Loading orders...</Text>
        ) : orders.length === 0 ? (
          <Text style={styles.emptyText}>No orders found</Text>
        ) : (
          orders.map((order) => {
            const statusColor = STATUS_COLORS[order.status as OrderStatus] ?? STATUS_COLORS.pending;
            const nextStatus = NEXT_STATUS[order.status as OrderStatus];

            return (
              <View key={order._id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View>
                    <Text style={styles.orderName}>{order.customerName}</Text>
                    <Text style={styles.orderContact}>{order.customerContact}</Text>
                  </View>
                  <View style={styles.orderRight}>
                    <Text style={styles.orderTotal}>&#8369;{order.total.toFixed(2)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                      <Text style={[styles.statusText, { color: statusColor.text }]}>
                        {order.status}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.orderDetails}>
                  <Text style={styles.orderMeta}>
                    {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} · {order.orderType ?? "N/A"} · {order.source ?? "web"}
                  </Text>
                  <Text style={styles.orderTime}>
                    {new Date(order._creationTime).toLocaleString()}
                  </Text>
                </View>

                {order.paymentMethod && (
                  <Text style={styles.paymentInfo}>
                    Payment: {order.paymentMethod} ({order.paymentStatus ?? "pending"})
                  </Text>
                )}

                {order.deliveryAddress && (
                  <Text style={styles.deliveryInfo}>
                    Delivery: {order.deliveryAddress}
                    {order.lalamoveStatus ? ` · Lalamove: ${order.lalamoveStatus}` : ""}
                  </Text>
                )}

                {nextStatus && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleUpdateStatus(order._id, nextStatus)}
                  >
                    <Text style={styles.actionButtonText}>
                      Mark as {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                    </Text>
                  </TouchableOpacity>
                )}

                {order.status === "cancelled" ? null : order.status !== "delivered" && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      Alert.alert("Cancel Order", "Are you sure?", [
                        { text: "No" },
                        { text: "Yes", onPress: () => handleUpdateStatus(order._id, "cancelled"), style: "destructive" },
                      ]);
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F0F" },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", padding: 20, paddingBottom: 12 },
  filterRow: { paddingHorizontal: 20, marginBottom: 12, maxHeight: 40 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1A1A1A", marginRight: 8, borderWidth: 1, borderColor: "#2A2A2A" },
  filterTabActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  filterText: { color: "#999", fontSize: 13, fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  list: { flex: 1 },
  listContent: { padding: 20, paddingTop: 0 },
  orderCard: { backgroundColor: "#1A1A1A", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#2A2A2A" },
  orderHeader: { flexDirection: "row", justifyContent: "space-between" },
  orderName: { fontSize: 16, fontWeight: "600", color: "#fff" },
  orderContact: { fontSize: 13, color: "#999", marginTop: 2 },
  orderRight: { alignItems: "flex-end" },
  orderTotal: { fontSize: 16, fontWeight: "bold", color: "#4F46E5" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  orderDetails: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  orderMeta: { fontSize: 12, color: "#999" },
  orderTime: { fontSize: 12, color: "#666" },
  paymentInfo: { fontSize: 12, color: "#999", marginTop: 6 },
  deliveryInfo: { fontSize: 12, color: "#999", marginTop: 4 },
  actionButton: { backgroundColor: "#4F46E5", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  actionButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cancelButton: { borderRadius: 8, paddingVertical: 8, alignItems: "center", marginTop: 6 },
  cancelButtonText: { color: "#EF4444", fontSize: 13 },
  emptyText: { color: "#666", textAlign: "center", paddingVertical: 40, fontSize: 15 },
});
