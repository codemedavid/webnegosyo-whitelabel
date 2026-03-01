import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation } from "../../../lib/hooks";
import { colors, typography, spacing, radius, shadow } from "../../../theme/colors";
import { Card } from "../../../components/Card";
import { Badge } from "../../../components/Badge";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";

const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";

const STATUS_STEPS: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "delivered"];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "delivered",
};

interface OrderItem {
  menuItemName: string;
  variation?: string;
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  quantity: number;
  subtotal: number;
}

interface OrderDetail {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  status: OrderStatus;
  orderType?: string;
  source: string;
  total: number;
  deliveryAddress?: string;
  deliveryFee?: number;
  lalamoveStatus?: string;
  lalamoveDriverName?: string;
  lalamoveDriverPhone?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: OrderItem[];
}

function StatusStepper({ currentStatus }: { currentStatus: OrderStatus }) {
  const currentIndex = STATUS_STEPS.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";

  return (
    <View style={stepperStyles.container}>
      {STATUS_STEPS.map((step, i) => {
        const isComplete = !isCancelled && i <= currentIndex;
        const isCurrent = !isCancelled && i === currentIndex;
        return (
          <View key={step} style={stepperStyles.step}>
            <View style={[
              stepperStyles.dot,
              isComplete && stepperStyles.dotComplete,
              isCurrent && stepperStyles.dotCurrent,
              isCancelled && stepperStyles.dotCancelled,
            ]} />
            <Text style={[stepperStyles.label, isComplete && stepperStyles.labelComplete]}>
              {step.charAt(0).toUpperCase() + step.slice(1)}
            </Text>
            {i < STATUS_STEPS.length - 1 && (
              <View style={[stepperStyles.line, isComplete && i < currentIndex && stepperStyles.lineComplete]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md },
  step: { alignItems: "center", flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.separator },
  dotComplete: { backgroundColor: colors.success },
  dotCurrent: { backgroundColor: colors.primary, width: 14, height: 14, borderRadius: 7 },
  dotCancelled: { backgroundColor: colors.danger },
  label: { ...typography.small, color: colors.textTertiary, marginTop: spacing.xs },
  labelComplete: { color: colors.textSecondary, fontWeight: "500" },
  line: { position: "absolute", top: 5, left: "60%", right: "-40%", height: 2, backgroundColor: colors.separator },
  lineComplete: { backgroundColor: colors.success },
});

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useSafeQuery<OrderDetail | null>(getOrderByIdRef, orderId ? { orderId } : "skip");
  const updateStatus = useSafeMutation(updateOrderStatusRef);

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!order) return;
    try {
      await updateStatus({ orderId: order._id, status: newStatus });
    } catch {
      Alert.alert("Error", "Failed to update status");
    }
  };

  if (order === undefined) {
    return <LoadingState fullScreen message="Loading order..." />;
  }

  if (order === null) {
    return (
      <View style={styles.screen}>
        <ErrorState message="Order not found" onRetry={() => router.back()} />
      </View>
    );
  }

  const nextStatus = NEXT_STATUS[order.status];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.statusHeader}>
        <Text style={styles.title}>Order Details</Text>
        <Badge label={order.status} variant={order.status} />
      </View>

      <Card style={styles.section}>
        <StatusStepper currentStatus={order.status} />
      </Card>

      <Card title="Customer" style={styles.section}>
        <Text style={styles.value}>{order.customerName}</Text>
        <Text style={styles.sub}>{order.customerContact}</Text>
        <Text style={styles.sub}>
          {order.orderType ?? "N/A"} · {order.source} · {new Date(order._creationTime).toLocaleString()}
        </Text>
      </Card>

      <Card title={`Items (${order.items?.length ?? 0})`} style={styles.section}>
        {order.items?.map((item, i) => (
          <View key={i} style={[styles.itemRow, i < (order.items?.length ?? 0) - 1 && styles.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.menuItemName}</Text>
              {item.variation && <Text style={styles.itemDetail}>Variation: {item.variation}</Text>}
              {item.addons && item.addons.length > 0 && (
                <Text style={styles.itemDetail}>Add-ons: {item.addons.map((a) => a.name).join(", ")}</Text>
              )}
              {item.specialInstructions && (
                <Text style={styles.itemDetail}>Note: {item.specialInstructions}</Text>
              )}
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemQty}>x{item.quantity}</Text>
              <Text style={styles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
            </View>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₱{order.total.toFixed(2)}</Text>
        </View>
      </Card>

      {order.deliveryAddress && (
        <Card title="Delivery" style={styles.section}>
          <Text style={styles.value}>{order.deliveryAddress}</Text>
          {order.deliveryFee != null && <Text style={styles.sub}>Fee: ₱{order.deliveryFee.toFixed(2)}</Text>}
          {order.lalamoveStatus && <Text style={styles.sub}>Lalamove: {order.lalamoveStatus}</Text>}
          {order.lalamoveDriverName && (
            <Text style={styles.sub}>Driver: {order.lalamoveDriverName} ({order.lalamoveDriverPhone})</Text>
          )}
        </Card>
      )}

      {order.paymentMethod && (
        <Card title="Payment" style={styles.section}>
          <Text style={styles.value}>{order.paymentMethod}</Text>
          <Text style={styles.sub}>Status: {order.paymentStatus ?? "pending"}</Text>
        </Card>
      )}

      {(nextStatus || (order.status !== "delivered" && order.status !== "cancelled")) && (
        <View style={styles.actions}>
          {nextStatus && (
            <TouchableOpacity style={styles.primaryAction} onPress={() => handleUpdateStatus(nextStatus)} activeOpacity={0.8}>
              <Text style={styles.primaryActionText}>
                Mark as {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
              </Text>
            </TouchableOpacity>
          )}
          {order.status !== "delivered" && order.status !== "cancelled" && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert("Cancel Order", "Are you sure?", [
                  { text: "No" },
                  { text: "Yes", onPress: () => handleUpdateStatus("cancelled"), style: "destructive" },
                ]);
              }}
            >
              <Text style={styles.cancelText}>Cancel Order</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  backButton: { marginBottom: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  statusHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary },
  section: { marginBottom: spacing.md },
  value: { ...typography.heading, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
  itemBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.separator },
  itemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  itemDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemRight: { alignItems: "flex-end", marginLeft: spacing.md },
  itemQty: { ...typography.caption, color: colors.textSecondary },
  itemPrice: { ...typography.body, color: colors.primary, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.separator },
  totalLabel: { ...typography.heading, color: colors.textPrimary },
  totalValue: { ...typography.heading, color: colors.primary },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  primaryAction: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: "center" },
  primaryActionText: { color: "#FFFFFF", ...typography.heading },
  cancelText: { ...typography.body, color: colors.danger, textAlign: "center", paddingVertical: spacing.sm },
});
