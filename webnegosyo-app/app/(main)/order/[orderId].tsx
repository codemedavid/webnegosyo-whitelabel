import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "convex/react";
import { FunctionReference } from "convex/server";

const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useQuery(getOrderByIdRef, orderId ? { orderId } : "skip") as any;

  if (!order) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading order...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backLink}>← Back to Orders</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Order Details</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <Text style={styles.value}>{order.customerName}</Text>
        <Text style={styles.valueSub}>{order.customerContact}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status</Text>
        <Text style={styles.value}>{order.status}</Text>
        <Text style={styles.valueSub}>
          {order.orderType ?? "N/A"} · {order.source} · &#8369;{order.total.toFixed(2)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items ({order.items?.length ?? 0})</Text>
        {order.items?.map((item: any, i: number) => (
          <View key={i} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.menuItemName}</Text>
              {item.variation && <Text style={styles.itemDetail}>Variation: {item.variation}</Text>}
              {item.addons?.length > 0 && (
                <Text style={styles.itemDetail}>
                  Add-ons: {item.addons.map((a: any) => a.name).join(", ")}
                </Text>
              )}
              {item.specialInstructions && (
                <Text style={styles.itemDetail}>Note: {item.specialInstructions}</Text>
              )}
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemQty}>x{item.quantity}</Text>
              <Text style={styles.itemPrice}>&#8369;{item.subtotal.toFixed(2)}</Text>
            </View>
          </View>
        ))}
      </View>

      {order.deliveryAddress && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery</Text>
          <Text style={styles.value}>{order.deliveryAddress}</Text>
          {order.deliveryFee && <Text style={styles.valueSub}>Fee: &#8369;{order.deliveryFee.toFixed(2)}</Text>}
          {order.lalamoveStatus && <Text style={styles.valueSub}>Lalamove: {order.lalamoveStatus}</Text>}
          {order.lalamoveDriverName && <Text style={styles.valueSub}>Driver: {order.lalamoveDriverName} ({order.lalamoveDriverPhone})</Text>}
        </View>
      )}

      {order.paymentMethod && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <Text style={styles.value}>{order.paymentMethod}</Text>
          <Text style={styles.valueSub}>Status: {order.paymentStatus ?? "pending"}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F0F" },
  content: { padding: 20 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0F0F0F" },
  loadingText: { color: "#999", fontSize: 16 },
  backLink: { color: "#4F46E5", fontSize: 14, marginBottom: 16 },
  heading: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  section: { backgroundColor: "#1A1A1A", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#2A2A2A" },
  sectionTitle: { fontSize: 13, color: "#999", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" },
  value: { fontSize: 16, color: "#fff", fontWeight: "500" },
  valueSub: { fontSize: 13, color: "#999", marginTop: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#2A2A2A" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, color: "#fff", fontWeight: "500" },
  itemDetail: { fontSize: 12, color: "#999", marginTop: 2 },
  itemRight: { alignItems: "flex-end", marginLeft: 12 },
  itemQty: { fontSize: 13, color: "#999" },
  itemPrice: { fontSize: 14, color: "#4F46E5", fontWeight: "600" },
});
