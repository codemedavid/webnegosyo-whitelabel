import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation } from "../../../lib/hooks";
import { colors, typography, spacing, radius } from "../../../theme/colors";
import { Card } from "../../../components/Card";
import { Badge } from "../../../components/Badge";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { useOrderPrint } from "../../../hooks/useOrderPrint";
import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { LalamoveDeliveryCard } from "../../../components/LalamoveDeliveryCard";

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
  variationSelections?: { typeName: string; optionName: string; priceAdjustment: number }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  quantity: number;
  subtotal: number;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

interface BundleGroup {
  bundleId: string;
  bundleName: string;
  items: OrderItem[];
  total: number;
}

interface OrderDetail {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  customerData?: Record<string, unknown>;
  status: OrderStatus;
  orderType?: string;
  source: string;
  total: number;
  deliveryAddress?: string;
  deliveryFee?: number;
  lalamoveQuotationId?: string;
  lalamoveOrderId?: string;
  lalamoveStatus?: string;
  lalamoveDriverName?: string;
  lalamoveDriverPhone?: string;
  lalamoveTrackingUrl?: string;
  paymentMethod?: string;
  paymentMethodDetails?: string;
  paymentStatus?: string;
  hasUpsellItems?: boolean;
  hasBundleItems?: boolean;
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

const HIDDEN_FIELDS = new Set([
  'messenger_psid',
  'delivery_lat',
  'delivery_lng',
  'customer_name',
  'customer_phone',
  'customer_contact',
]);

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupBundleItems(items: OrderItem[]): { regularItems: OrderItem[]; bundles: BundleGroup[] } {
  const regularItems: OrderItem[] = [];
  const bundleMap = new Map<string, BundleGroup>();

  for (const item of items) {
    if (item.isBundleItem && item.bundleId) {
      const existing = bundleMap.get(item.bundleId);
      if (existing) {
        existing.items.push(item);
        existing.total += item.subtotal;
      } else {
        bundleMap.set(item.bundleId, {
          bundleId: item.bundleId,
          bundleName: item.bundleName ?? "Bundle",
          items: [item],
          total: item.subtotal,
        });
      }
    } else {
      regularItems.push(item);
    }
  }

  return { regularItems, bundles: Array.from(bundleMap.values()) };
}

function BundleCard({ bundle }: { bundle: BundleGroup }) {
  const [expanded, setExpanded] = React.useState(true);

  return (
    <View style={bundleStyles.container}>
      <TouchableOpacity
        style={bundleStyles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={bundleStyles.headerLeft}>
          <Text style={bundleStyles.icon}>📦</Text>
          <View>
            <Text style={bundleStyles.bundleName}>{bundle.bundleName}</Text>
            <Text style={bundleStyles.itemCount}>
              {bundle.items.length} item{bundle.items.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <View style={bundleStyles.headerRight}>
          <Text style={bundleStyles.bundleTotal}>₱{bundle.total.toFixed(2)}</Text>
          <Text style={bundleStyles.chevron}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={bundleStyles.itemList}>
          {bundle.items.map((item, i) => (
            <View key={i} style={[bundleStyles.item, i < bundle.items.length - 1 && bundleStyles.itemBorder]}>
              <View style={{ flex: 1 }}>
                {item.slotName && (
                  <Text style={bundleStyles.slotLabel}>{item.slotName}</Text>
                )}
                <Text style={styles.itemName}>{item.menuItemName}</Text>
                {item.variationSelections && item.variationSelections.length > 0 ? (
                  item.variationSelections.map((v, vi) => (
                    <Text key={vi} style={styles.itemDetail}>{v.typeName}: {v.optionName}</Text>
                  ))
                ) : item.variation ? (
                  <Text style={styles.itemDetail}>Variation: {item.variation}</Text>
                ) : null}
                {item.addons && item.addons.length > 0 && (
                  <Text style={styles.itemDetail}>Add-ons: {item.addons.map(a => a.name).join(", ")}</Text>
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
        </View>
      )}
    </View>
  );
}

const bundleStyles = StyleSheet.create({
  container: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    marginVertical: spacing.xs,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    fontSize: 20,
  },
  bundleName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  itemCount: {
    ...typography.small,
    color: colors.textTertiary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bundleTotal: {
    ...typography.body,
    fontWeight: "600",
    color: colors.primary,
  },
  chevron: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  itemList: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: `${colors.primary}20`,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
  },
  itemBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  slotLabel: {
    ...typography.small,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
  },
});

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { data: order, isLoading, error } = useSafeQuery<OrderDetail | null>(getOrderByIdRef, orderId ? { orderId } : "skip");
  const updateStatus = useSafeMutation(updateOrderStatusRef);
  const { printOrder, autoPrint, hasPrinter } = useOrderPrint();

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    if (!order) return;
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    try {
      // When confirming with auto-print enabled, attempt print BEFORE updating status
      if (newStatus === "confirmed" && autoPrint && hasPrinter) {
        const printed = await printOrder(order);
        if (!printed) {
          Alert.alert("Print Warning", "Receipt could not be printed. Order will still be confirmed.");
        }
      }

      await updateStatus({ orderId: order._id, status: newStatus });
    } catch {
      Alert.alert("Error", "Failed to update status");
    }
  };

  if (error) {
    return (
      <View style={styles.screen}>
        <ErrorState message={error} onRetry={() => router.back()} />
      </View>
    );
  }

  if (isLoading) {
    return <LoadingState fullScreen message="Loading order..." />;
  }

  if (order === null || order === undefined) {
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
        {(order.hasUpsellItems || order.hasBundleItems) && (
          <View style={styles.tagRow}>
            {order.hasUpsellItems && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>Upsell</Text>
              </View>
            )}
            {order.hasBundleItems && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>Bundle</Text>
              </View>
            )}
          </View>
        )}
      </Card>

      {order.customerData && Object.keys(order.customerData).filter(
        (k) => !HIDDEN_FIELDS.has(k) && order.customerData![k] != null && String(order.customerData![k]).trim() !== ''
      ).length > 0 && (
        <Card title="Customer Details" style={styles.section}>
          {Object.entries(order.customerData)
            .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v != null && String(v).trim() !== '')
            .map(([key, value]) => (
              <View key={key} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{formatFieldLabel(key)}</Text>
                <Text style={styles.detailValue}>{String(value)}</Text>
              </View>
            ))}
        </Card>
      )}

      <Card title={`Items (${order.items?.length ?? 0})`} style={styles.section}>
        {(() => {
          const { regularItems, bundles } = groupBundleItems(order.items ?? []);
          return (
            <>
              {regularItems.map((item, i) => (
                <View key={i} style={[styles.itemRow, i < regularItems.length - 1 && styles.itemBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.menuItemName}</Text>
                    {item.variationSelections && item.variationSelections.length > 0 ? (
                      item.variationSelections.map((v, vi) => (
                        <Text key={vi} style={styles.itemDetail}>{v.typeName}: {v.optionName}</Text>
                      ))
                    ) : item.variation ? (
                      <Text style={styles.itemDetail}>Variation: {item.variation}</Text>
                    ) : null}
                    {item.addons && item.addons.length > 0 && (
                      <Text style={styles.itemDetail}>Add-ons: {item.addons.map(a => a.name).join(", ")}</Text>
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
              {bundles.map((bundle) => (
                <BundleCard key={bundle.bundleId} bundle={bundle} />
              ))}
            </>
          );
        })()}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₱{order.total.toFixed(2)}</Text>
        </View>
      </Card>

      {order.deliveryAddress && (
        <Card title="Delivery" style={styles.section}>
          <Text style={styles.value}>{order.deliveryAddress}</Text>
          {order.deliveryFee != null && <Text style={styles.sub}>Fee: ₱{order.deliveryFee.toFixed(2)}</Text>}
        </Card>
      )}

      <LalamoveDeliveryCard order={order} />

      {order.paymentMethod && (
        <Card title="Payment" style={styles.section}>
          <Text style={styles.value}>{order.paymentMethod}</Text>
          {order.paymentMethodDetails && (
            <Text style={styles.sub}>{order.paymentMethodDetails}</Text>
          )}
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
          {order.status !== "pending" && order.status !== "cancelled" && hasPrinter && (
            <TouchableOpacity
              style={styles.reprintButton}
              onPress={async () => {
                const printed = await printOrder(order);
                if (!printed) {
                  Alert.alert("Print Failed", "Could not print receipt.");
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.reprintText}>Reprint Receipt</Text>
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
  reprintButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  reprintText: {
    color: colors.primary,
    ...typography.heading,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 2,
    textAlign: "right",
  },
  tagRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}15`,
  },
  tagText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: "600",
  },
});
