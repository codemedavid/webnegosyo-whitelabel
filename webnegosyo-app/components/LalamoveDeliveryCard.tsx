import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, ActivityIndicator } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeAction } from "../lib/hooks";
import { useAuthStore } from "../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../lib/demo";
import { colors, typography, spacing, radius } from "../theme/colors";
import { Card } from "./Card";
import { Badge } from "./Badge";

const bookLalamoveRef = "lalamove:bookLalamove" as unknown as FunctionReference<"action">;
const cancelLalamoveRef = "lalamove:cancelLalamove" as unknown as FunctionReference<"action">;
const addPriorityFeeRef = "lalamove:addLalamovePriorityFee" as unknown as FunctionReference<"action">;
const syncStatusRef = "lalamove:syncLalamoveStatus" as unknown as FunctionReference<"action">;

/** Preset priority-fee amounts (PHP) — keeps the picker cross-platform. */
const PRIORITY_FEE_OPTIONS = ["20", "50", "100"];

const FINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "COMPLETED", "EXPIRED"]);

interface LalamoveOrderFields {
  _id: string;
  lalamoveQuotationId?: string;
  lalamoveOrderId?: string;
  lalamoveStatus?: string;
  lalamoveDriverName?: string;
  lalamoveDriverPhone?: string;
  lalamoveTrackingUrl?: string;
}

interface LalamoveDeliveryCardProps {
  order: LalamoveOrderFields;
}

type ActionResult = { success: boolean; error?: string };

export function LalamoveDeliveryCard({ order }: LalamoveDeliveryCardProps) {
  const bookLalamove = useSafeAction(bookLalamoveRef);
  const cancelLalamove = useSafeAction(cancelLalamoveRef);
  const addPriorityFee = useSafeAction(addPriorityFeeRef);
  const syncStatus = useSafeAction(syncStatusRef);

  const [busy, setBusy] = React.useState<null | "book" | "sync" | "cancel" | "fee">(null);

  const hasQuotation = !!order.lalamoveQuotationId;
  const hasOrder = !!order.lalamoveOrderId && String(order.lalamoveOrderId).trim() !== "";
  const status = order.lalamoveStatus ?? "";
  const isFinal = FINAL_STATUSES.has(status.toUpperCase());

  // Nothing to show if this order never had a Lalamove quotation.
  if (!hasQuotation && !hasOrder) return null;

  const guardDemo = (): boolean => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return true;
    }
    return false;
  };

  const run = async (
    kind: NonNullable<typeof busy>,
    fn: () => Promise<ActionResult>,
    successMessage: string
  ) => {
    if (guardDemo()) return;
    setBusy(kind);
    try {
      const result = await fn();
      if (result?.success) {
        Alert.alert("Success", successMessage);
      } else {
        Alert.alert("Lalamove", result?.error ?? "Something went wrong");
      }
    } catch {
      Alert.alert("Lalamove", "Failed to reach the delivery service");
    } finally {
      setBusy(null);
    }
  };

  const handleBook = () =>
    run("book", () => bookLalamove({ orderId: order._id }) as Promise<ActionResult>, "Delivery booked. Searching for a driver…");

  const handleSync = () =>
    run("sync", () => syncStatus({ orderId: order._id }) as Promise<ActionResult>, "Delivery status updated");

  const handleCancel = () => {
    if (guardDemo()) return;
    Alert.alert("Cancel delivery", "Cancel this Lalamove delivery?", [
      { text: "No" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: () =>
          run("cancel", () => cancelLalamove({ orderId: order._id }) as Promise<ActionResult>, "Delivery cancelled"),
      },
    ]);
  };

  const handlePriorityFee = () => {
    if (guardDemo()) return;
    Alert.alert("Add priority fee", "A tip helps match a driver faster.", [
      ...PRIORITY_FEE_OPTIONS.map((amount) => ({
        text: `₱${amount}`,
        onPress: () =>
          run(
            "fee",
            () => addPriorityFee({ orderId: order._id, amount }) as Promise<ActionResult>,
            `₱${amount} priority fee added`
          ),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleTrack = () => {
    if (order.lalamoveTrackingUrl) Linking.openURL(order.lalamoveTrackingUrl);
  };

  return (
    <Card title="Lalamove Delivery" style={styles.card}>
      {hasOrder ? (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Badge label={status || "Booked"} variant="confirmed" />
          </View>
          {order.lalamoveDriverName ? (
            <View style={styles.row}>
              <Text style={styles.label}>Driver</Text>
              <Text style={styles.value}>{order.lalamoveDriverName}</Text>
            </View>
          ) : !isFinal ? (
            <View style={styles.row}>
              <Text style={styles.label}>Driver</Text>
              <Text style={styles.muted}>Searching…</Text>
            </View>
          ) : null}
          {order.lalamoveDriverPhone && (
            <TouchableOpacity
              style={styles.row}
              onPress={() => Linking.openURL(`tel:${order.lalamoveDriverPhone}`)}
            >
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.link}>{order.lalamoveDriverPhone}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actions}>
            {order.lalamoveTrackingUrl && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleTrack} disabled={!!busy}>
                <Text style={styles.secondaryText}>Track</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleSync} disabled={!!busy}>
              {busy === "sync" ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>Sync</Text>}
            </TouchableOpacity>
            {!isFinal && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handlePriorityFee} disabled={!!busy}>
                {busy === "fee" ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>Priority Fee</Text>}
              </TouchableOpacity>
            )}
            {!isFinal && (
              <TouchableOpacity style={styles.dangerBtn} onPress={handleCancel} disabled={!!busy}>
                {busy === "cancel" ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.dangerText}>Cancel</Text>}
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            This order has a delivery quote. Book the driver when you&apos;re ready.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleBook} disabled={!!busy} activeOpacity={0.8}>
            {busy === "book" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>Book Lalamove Delivery</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  muted: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  link: { ...typography.body, color: colors.primary },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#FFFFFF", ...typography.heading },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  secondaryText: { color: colors.primary, ...typography.body, fontWeight: "600" },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  dangerText: { color: colors.danger, ...typography.body, fontWeight: "600" },
});
