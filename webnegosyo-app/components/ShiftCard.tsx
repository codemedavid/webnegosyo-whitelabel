import React, { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";
import { DEMO_READONLY_MESSAGE } from "../lib/demo";
import { reconcileShift, validateCashAmount } from "../lib/shift";
import { closeShift, loadOpenShift, openShift, type ShiftRecord } from "../lib/shift-service";
import { summarizeShiftDrawer } from "../lib/shift-drawer";
import { OrderSettlementReader, type StaffPayment } from "./OrderSettlementReader";
import { useBranchContextStore } from "../stores/branch-context-store";
import { resolveRegisterOutlet } from "../lib/register-outlet";
import type { CounterSale } from "../lib/pos-sales";
import { formatPeso } from "../lib/format";
import { listOrderActivity } from "../lib/staff-activity/activity-service";
import { describeActivity, summarizeActorActivity, type OrderActivityEvent } from "../lib/staff-activity/activity";
import { colors, radius, spacing, typography } from "../theme/colors";

/**
 * Clock in / clock out, on the Drawer screen — the shift starts and ends
 * where the money does.
 *
 * The card owns the shift row (lib/shift-service) and the personal drawer
 * figures (lib/shift-drawer); the screen only lends it the same orders the
 * day totals already fetched, so the two can never disagree about a sale.
 */
export function ShiftCard({ orders, complete }: { orders: readonly CounterSale[]; complete: boolean }) {
  const tenantId = useAuthStore(s => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore(s => s.userId);
  return <OrderSettlementReader key={`${tenantId}:${userId}`} ids={orders.map(order => order._id)}>
    {(payments, ready, error) => <ShiftCardContent orders={orders} payments={payments}
      historyReady={complete && ready} historyError={error ?? (!complete ? "Order history is incomplete. Refresh before reconciling this shift." : null)} />}
  </OrderSettlementReader>;
}

function ShiftCardContent({ orders, payments, historyReady, historyError }: {
  orders: readonly CounterSale[]; payments: StaffPayment[]; historyReady: boolean; historyError: string | null;
}) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);


  const [shift, setShift] = useState<ShiftRecord | null>(null);
  const [checked, setChecked] = useState(false);
  const [floatText, setFloatText] = useState("");
  const [countText, setCountText] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  // What this person did to web orders during the shift. Read separately
  // from the drawer and never added to it: a confirmed web order is the
  // store's money, not this drawer's (shift-drawer.ts).
  const [activity, setActivity] = useState<OrderActivityEvent[] | null>(null);

  const reload = useCallback(async () => {
    if (!tenantId || !userId) {
      setChecked(true);
      return;
    }
    const open = await loadOpenShift(tenantId, userId);
    setShift(open);
    setChecked(true);
    if (!open) {
      setActivity(null);
      return;
    }
    try {
      setActivity(await listOrderActivity(tenantId, { sinceIso: open.openedAt, actorUserId: userId }));
    } catch (error) {
      console.warn("[shift] activity unavailable", error);
      setActivity(null);
    }
  }, [tenantId, userId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const activitySummary = useMemo(() => {
    if (!shift || !userId || !activity) return null;
    return summarizeActorActivity(activity, userId, {
      startMs: Date.parse(shift.openedAt),
      endMs: shift.closedAt ? Date.parse(shift.closedAt) : Date.now(),
    });
  }, [shift, userId, activity]);

  const drawer = useMemo(() => {
    if (!shift || !userId || !historyReady) return null;
    const summary = summarizeShiftDrawer(
      orders,
      payments,
      { outletId: shift.outletId, staffUserId: userId, openedAt: shift.openedAt, closedAt: shift.closedAt },
      Date.now(),
    );
    return {
      summary,
      reconciliation: reconcileShift({
        openingFloat: shift.openingFloat,
        cashCollected: summary.cashTotal,
      }),
    };
  }, [shift, userId, orders, payments, historyReady]);

  const refuseInDemo = (): boolean => {
    if (!useAuthStore.getState().isDemo) return false;
    Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
    return true;
  };

  const handleOpen = async () => {
    if (refuseInDemo() || !tenantId || !userId) return;
    const float = validateCashAmount(Number(floatText || "0"));
    if (!float.ok) {
      Alert.alert("Opening float", float.reason);
      return;
    }
    const selection = useBranchContextStore.getState();
    const outlet = resolveRegisterOutlet(useAuthStore.getState(), selection);
    if ((selection.knownOutletIds?.length ?? 0) > 0 && !outlet) {
      Alert.alert("Choose a branch", "Select the branch whose drawer you are opening.");
      return;
    }
    setBusy(true);
    try {
      // The name is snapshotted onto the shift so deleting the account later
      // keeps the history named. The session already knows who signed in.
      const { data } = await supabase.auth.getUser();
      const staffName =
        (data.user?.user_metadata?.display_name as string | undefined) ||
        data.user?.email ||
        "Staff";
      const opened = await openShift(tenantId, {
        outletId: outlet?.id ?? null,
        staffUserId: userId,
        staffName,
        openingFloat: float.amount,
      });
      setShift(opened);
      setFloatText("");
    } catch (error) {
      Alert.alert(
        "Could not start the shift",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (refuseInDemo() || !tenantId || !shift || !drawer) return;
    const counted = validateCashAmount(Number(countText));
    if (!countText.trim() || !counted.ok) {
      Alert.alert("Count the drawer", counted.ok ? "Enter the counted amount." : counted.reason);
      return;
    }
    const rec = reconcileShift({
      openingFloat: shift.openingFloat,
      cashCollected: drawer.summary.cashTotal,
      countedCash: counted.amount,
    });
    setBusy(true);
    try {
      await closeShift(tenantId, shift.id, {
        closingCount: counted.amount,
        // Frozen at the moment of close; see shift-service.ts.
        expectedCash: rec.expectedInDrawer,
        note: null,
      });
      setShift(null);
      setIsClosing(false);
      setCountText("");
      const verdictLine =
        rec.verdict === "balanced"
          ? "The drawer balanced."
          : rec.verdict === "short"
            ? `The drawer is short ${formatPeso(Math.abs(rec.variance ?? 0))}.`
            : `The drawer is over ${formatPeso(rec.variance ?? 0)}.`;
      Alert.alert(
        "Shift ended",
        `Turn over ${formatPeso(rec.expectedTurnover)} and keep the ${formatPeso(shift.openingFloat)} float. ${verdictLine}`,
      );
    } catch (error) {
      Alert.alert(
        "Could not end the shift",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!checked) return null;

  if (!shift) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Start your shift</Text>
        <Text style={styles.meta}>
          Count the cash already in the drawer so your takings reconcile at close.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Opening float (₱)"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            value={floatText}
            onChangeText={setFloatText}
            accessibilityLabel="Opening float in pesos"
          />
          <TouchableOpacity
            style={[styles.button, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void handleOpen()}
            accessibilityLabel="Start shift"
          >
            <Text style={styles.buttonLabel}>{busy ? "…" : "Clock in"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.title}>My shift</Text>
        <Text style={styles.meta}>
          since {new Date(shift.openedAt).toLocaleTimeString()}
        </Text>
      </View>
      {!historyReady && <Text style={styles.meta}>{historyError ?? "Loading settlement history…"}</Text>}
      {activitySummary && (
        <Text style={styles.meta} accessibilityLabel="Web orders handled this shift">
          {describeActivity(activitySummary)}
          {activitySummary.confirmedTotal > 0 ? ` (${formatPeso(activitySummary.confirmedTotal)} confirmed, not in drawer)` : ""}
        </Text>
      )}
      {drawer && (
        <>
          <Text style={styles.meta}>
            Float {formatPeso(shift.openingFloat)} · my cash sales{" "}
            {formatPeso(drawer.summary.cashTotal)} · other{" "}
            {formatPeso(drawer.summary.nonCashTotal)}
          </Text>
          <Text style={styles.expected}>
            Drawer should hold {formatPeso(drawer.reconciliation.expectedInDrawer)} — turnover
            due {formatPeso(drawer.reconciliation.expectedTurnover)}
          </Text>
        </>
      )}
      {isClosing ? (
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Counted cash (₱)"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            value={countText}
            onChangeText={setCountText}
            accessibilityLabel="Counted cash in pesos"
          />
          <TouchableOpacity
            style={[styles.button, busy && styles.disabled]}
            disabled={busy || !historyReady}
            onPress={() => void handleClose()}
            accessibilityLabel="Confirm end of shift"
          >
            <Text style={styles.buttonLabel}>{busy ? "…" : "Confirm"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.ghostButton}
          onPress={() => setIsClosing(true)}
          accessibilityLabel="End shift"
        >
          <Text style={styles.ghostLabel}>End shift — count the drawer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  expected: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flex: 1,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  disabled: { opacity: 0.5 },
  buttonLabel: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
  ghostButton: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  ghostLabel: { ...typography.body, color: colors.textPrimary },
});
