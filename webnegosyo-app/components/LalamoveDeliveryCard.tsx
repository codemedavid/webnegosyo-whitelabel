import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, ActivityIndicator } from "react-native";
import { FunctionReference } from "convex/server";
import { useSafeAction } from "../lib/hooks";
import { useAuthStore } from "../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../lib/demo";
import { resolveLalamoveTransport, type LalamoveOp } from "../lib/lalamove-transport";
import { runPlatformLalamoveOp } from "../lib/lalamove-service";
import {
  isActiveLalamoveDelivery,
  isLalamoveFinal,
  lalamoveBadgeVariant,
  lalamoveStatusLabel,
} from "../lib/lalamove-status";
import { colors, typography, spacing, radius } from "../theme/colors";
import { Card } from "./Card";
import { Badge } from "./Badge";

const bookLalamoveRef = "lalamove:bookLalamove" as unknown as FunctionReference<"action">;
const cancelLalamoveRef = "lalamove:cancelLalamove" as unknown as FunctionReference<"action">;
const addPriorityFeeRef = "lalamove:addLalamovePriorityFee" as unknown as FunctionReference<"action">;
const syncStatusRef = "lalamove:syncLalamoveStatus" as unknown as FunctionReference<"action">;
const requoteLalamoveRef = "lalamove:requoteLalamove" as unknown as FunctionReference<"action">;

/** Preset priority-fee amounts (PHP) — keeps the picker cross-platform. */
const PRIORITY_FEE_OPTIONS = ["20", "50", "100"];

/** How often an active delivery re-polls itself. Driver assignment used to be
 * invisible until someone tapped Sync. */
const AUTO_SYNC_INTERVAL_MS = 45_000;

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
  const requoteLalamove = useSafeAction(requoteLalamoveRef);

  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const transport = resolveLalamoveTransport({ convexUrl, orderBackend });

  const [busy, setBusy] = React.useState<null | "book" | "sync" | "cancel" | "fee" | "requote">(
    null,
  );

  const hasQuotation = !!order.lalamoveQuotationId;
  const hasOrder = !!order.lalamoveOrderId && String(order.lalamoveOrderId).trim() !== "";
  const status = order.lalamoveStatus ?? "";
  const isFinal = isLalamoveFinal(status);
  const shouldAutoSync =
    hasOrder && isActiveLalamoveDelivery(status) && transport !== "unavailable";

  // Auto-refresh a live delivery so driver assignment and progress show up on
  // the phone without anyone pressing Sync. Persisting the sync updates the
  // order row/doc, and the screen's reactive order query re-renders this card.
  // Stops by itself once the status is final.
  React.useEffect(() => {
    if (!shouldAutoSync) return;
    if (useAuthStore.getState().isDemo) return;

    const intervalId = setInterval(() => {
      void dispatch("sync").catch(() => {
        // A missed poll self-heals on the next tick; alerting would nag.
      });
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSync, order._id, transport, tenantId]);

  const guardDemo = (): boolean => {
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return true;
    }
    return false;
  };

  /** The Convex action for each operation, when the store has a deployment. */
  const convexActionFor: Record<LalamoveOp, (args: Record<string, unknown>) => unknown> = {
    book: bookLalamove,
    sync: syncStatus,
    cancel: cancelLalamove,
    priority_fee: addPriorityFee,
    requote: requoteLalamove,
  };

  /**
   * Run one operation on whichever backend this store actually has.
   *
   * Convex stores keep calling their own deployment's actions. Platform stores
   * have no deployment at all, so they go through the web route — which is the
   * whole reason this card did nothing for them before.
   */
  const dispatch = async (op: LalamoveOp, amount?: string): Promise<ActionResult> => {
    if (transport === "platform") {
      if (!tenantId) return { success: false, error: "No store is selected" };
      return runPlatformLalamoveOp({ op, tenantId, orderId: order._id, amount });
    }
    const args = amount === undefined
      ? { orderId: order._id }
      : { orderId: order._id, amount };
    return (await convexActionFor[op](args)) as ActionResult;
  };

  const run = async (
    kind: NonNullable<typeof busy>,
    op: LalamoveOp,
    successMessage: string,
    amount?: string
  ) => {
    if (guardDemo()) return;
    setBusy(kind);
    try {
      const result = await dispatch(op, amount);
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

  const handleRequote = () => run("requote", "requote", "New quotation created — you can book the delivery now.");

  /**
   * Book, with the expired-quotation recovery folded into the failure alert:
   * the quotation dies ~5 minutes after checkout, and sending the merchant to
   * hunt for a separate button at that moment loses them.
   */
  const runBook = async () => {
    setBusy("book");
    try {
      const result = await dispatch("book");
      if (result?.success) {
        Alert.alert("Success", "Delivery booked. Searching for a driver…");
      } else if (result?.error && /expired|quotation/i.test(result.error)) {
        Alert.alert("Lalamove", result.error, [
          { text: "Close", style: "cancel" },
          {
            text: "Get New Quote",
            onPress: () => {
              void run("requote", "requote", "New quotation created — book the delivery now.");
            },
          },
        ]);
      } else {
        Alert.alert("Lalamove", result?.error ?? "Something went wrong");
      }
    } catch {
      Alert.alert("Lalamove", "Failed to reach the delivery service");
    } finally {
      setBusy(null);
    }
  };

  const handleBook = () => {
    if (guardDemo()) return;
    // Booking dispatches a real rider and bills the store's Lalamove account —
    // one accidental tap must not do that.
    Alert.alert("Book delivery", "Book a Lalamove rider for this order now?", [
      { text: "Not yet", style: "cancel" },
      { text: "Book", onPress: () => void runBook() },
    ]);
  };

  const handleSync = () => run("sync", "sync", "Delivery status updated");

  const handleCancel = () => {
    if (guardDemo()) return;
    Alert.alert("Cancel delivery", "Cancel this Lalamove delivery?", [
      { text: "No" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: () => run("cancel", "cancel", "Delivery cancelled"),
      },
    ]);
  };

  const handlePriorityFee = () => {
    if (guardDemo()) return;
    Alert.alert("Add priority fee", "A tip helps match a driver faster.", [
      ...PRIORITY_FEE_OPTIONS.map((amount) => ({
        text: `₱${amount}`,
        onPress: () =>
          run("fee", "priority_fee", `₱${amount} priority fee added`, amount),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleTrack = () => {
    if (order.lalamoveTrackingUrl) Linking.openURL(order.lalamoveTrackingUrl);
  };

  // Nothing to show if this order never had a Lalamove quotation.
  if (!hasQuotation && !hasOrder) return null;

  // No backend the app can reach — a per-tenant Supabase project, for which it
  // ships no adapter. Show what is known and say where the merchant CAN act,
  // rather than offering buttons that would fail on every tap.
  if (transport === "unavailable") {
    return (
      <Card title="Lalamove Delivery" style={styles.card}>
        {hasOrder ? (
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Badge label={lalamoveStatusLabel(status)} variant={lalamoveBadgeVariant(status)} />
          </View>
        ) : null}
        <Text style={styles.muted}>
          Bookings for this store are managed from the web dashboard.
        </Text>
        {order.lalamoveTrackingUrl ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleTrack}>
            <Text style={styles.secondaryText}>Track</Text>
          </TouchableOpacity>
        ) : null}
      </Card>
    );
  }

  return (
    <Card title="Lalamove Delivery" style={styles.card}>
      {hasOrder ? (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Badge label={lalamoveStatusLabel(status)} variant={lalamoveBadgeVariant(status)} />
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
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <Text style={styles.primaryText}>Book Lalamove Delivery</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.requoteBtn]}
            onPress={handleRequote}
            disabled={!!busy}
          >
            {busy === "requote" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryText}>Get New Quote</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.hint}>
            Quotes expire after ~5 minutes. If booking fails with an expired quotation, get a
            new quote first.
          </Text>
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
  link: { ...typography.body, color: colors.accent },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: colors.textOnDark, ...typography.heading },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  secondaryText: { color: colors.primary, ...typography.body, fontWeight: "600" },
  requoteBtn: { marginTop: spacing.sm },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  dangerText: { color: colors.danger, ...typography.body, fontWeight: "600" },
});
