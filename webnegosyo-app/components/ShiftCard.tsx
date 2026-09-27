import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";
import { DEMO_READONLY_MESSAGE } from "../lib/demo";
import { withDeadline } from "../lib/offline/deadline";
import { isShiftHistoryComplete, parseCashInput, reconcileShift, validateCashAmount, type ShiftReconciliation } from "../lib/shift";
import { closeShift, fetchOpenShift, loadOpenShift, openShift, type ShiftRecord } from "../lib/shift-service";
import { summarizeShiftDrawer } from "../lib/shift-drawer";
import { OrderSettlementReader, type StaffPayment } from "./OrderSettlementReader";
import { useBranchContextStore } from "../stores/branch-context-store";
import { resolveRegisterOutlet } from "../lib/register-outlet";
import type { CounterSale } from "../lib/pos-sales";
import { formatPeso } from "../lib/format";
import { listOrderActivity } from "../lib/staff-activity/activity-service";
import { describeActivity, summarizeActorActivity, type OrderActivityEvent } from "../lib/staff-activity/activity";
import { colors, radius, spacing, typography } from "../theme/colors";

/** The session read only names the shift; it must never hold up the clock-in. */
const SESSION_READ_MS = 5_000;

const INCOMPLETE_HISTORY_MESSAGE =
  "More orders than this screen reads were rung up since you clocked in, so this drawer can't be reconciled on this screen.";

/**
 * Clock in / clock out, on the Drawer screen — the shift starts and ends
 * where the money does.
 *
 * The card owns the shift row (lib/shift-service) and the personal drawer
 * figures (lib/shift-drawer); the screen only lends it the same orders the
 * day totals already fetched, so the two can never disagree about a sale.
 * `pageLimit` is the size of that newest-first page: whether it covers the
 * whole shift is judged against the shift's own start (isShiftHistoryComplete).
 */
export function ShiftCard({ orders, pageLimit }: { orders: readonly CounterSale[]; pageLimit: number }) {
  const tenantId = useAuthStore(s => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore(s => s.userId);
  return <OrderSettlementReader key={`${tenantId}:${userId}`} ids={orders.map(order => order._id)}>
    {(payments, ready, error) => <ShiftCardContent orders={orders} payments={payments}
      pageLimit={pageLimit} ledgerReady={ready} ledgerError={error} />}
  </OrderSettlementReader>;
}

/** The name snapshotted onto the shift; falls back rather than blocking. */
async function readStaffName(): Promise<string> {
  try {
    const { data } = await withDeadline(supabase.auth.getSession(), SESSION_READ_MS);
    const user = data.session?.user;
    return (user?.user_metadata?.display_name as string | undefined) || user?.email || "Staff";
  } catch (error) {
    console.warn("[shift] session unavailable for the staff name", error);
    return "Staff";
  }
}

function describeClose(rec: ShiftReconciliation, openingFloat: number): string {
  const verdictLine =
    rec.verdict === "balanced"
      ? "The drawer balanced."
      : rec.verdict === "short"
        ? `The drawer is short ${formatPeso(Math.abs(rec.variance ?? 0))}.`
        : `The drawer is over ${formatPeso(rec.variance ?? 0)}.`;
  return `Turn over ${formatPeso(rec.expectedTurnover)} and keep the ${formatPeso(openingFloat)} float. ${verdictLine}`;
}

function formatShiftStart(openedAt: string): string {
  return new Date(openedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function refuseInDemo(): boolean {
  if (!useAuthStore.getState().isDemo) return false;
  Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
  return true;
}

function ShiftCardContent({ orders, payments, pageLimit, ledgerReady, ledgerError }: {
  orders: readonly CounterSale[]; payments: StaffPayment[]; pageLimit: number;
  ledgerReady: boolean; ledgerError: string | null;
}) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);

  const [shift, setShift] = useState<ShiftRecord | null>(null);
  const [checked, setChecked] = useState(false);
  const [floatText, setFloatText] = useState("");
  const [countText, setCountText] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  // State lands a render late: two taps inside one frame both saw `busy`
  // false and both wrote. The ref is read synchronously.
  const inFlight = useRef(false);
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

  const historyComplete = shift ? isShiftHistoryComplete(orders, pageLimit, shift.openedAt) : false;
  const historyReady = ledgerReady && historyComplete;
  const historyError = ledgerError ?? (shift && !historyComplete ? INCOMPLETE_HISTORY_MESSAGE : null);

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

  const runExclusive = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleOpen = () => runExclusive(async () => {
    if (refuseInDemo() || !tenantId || !userId) return;
    // A blank float is a deliberate "the drawer starts empty".
    const float = validateCashAmount(floatText.trim() ? parseCashInput(floatText) : 0);
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
    try {
      // The name is snapshotted onto the shift so deleting the account later
      // keeps the history named.
      const opened = await openShift(tenantId, {
        outletId: outlet?.id ?? null,
        staffUserId: userId,
        staffName: await readStaffName(),
        openingFloat: float.amount,
      });
      setShift(opened);
      setFloatText("");
    } catch (error) {
      Alert.alert("Could not start the shift", error instanceof Error ? error.message : "Try again.");
    }
  });

  const finishClose = (rec: ShiftReconciliation, openingFloat: number) => {
    setShift(null);
    setActivity(null);
    setIsClosing(false);
    setCountText("");
    Alert.alert("Shift ended", describeClose(rec, openingFloat));
  };

  const handleClose = () => runExclusive(async () => {
    if (refuseInDemo() || !tenantId || !userId || !shift) return;
    if (!drawer) {
      Alert.alert("Not ready to close", historyError ?? "Settlement history is still loading. Try again in a moment.");
      return;
    }
    const counted = validateCashAmount(parseCashInput(countText));
    if (!countText.trim() || !counted.ok) {
      Alert.alert("Count the drawer", counted.ok || !countText.trim() ? "Enter the counted amount." : counted.reason);
      return;
    }
    const rec = reconcileShift({
      openingFloat: shift.openingFloat,
      cashCollected: drawer.summary.cashTotal,
      countedCash: counted.amount,
    });
    try {
      await closeShift(tenantId, shift.id, {
        closingCount: counted.amount,
        // Frozen at the moment of close; see shift-service.ts.
        expectedCash: rec.expectedInDrawer,
        note: null,
      });
      finishClose(rec, shift.openingFloat);
    } catch (error) {
      // A timed-out close may still have landed. Only a successful read that
      // no longer finds THIS shift open counts as closed — a failed read is
      // not evidence either way.
      const hasLanded = await fetchOpenShift(tenantId, userId)
        .then((open) => open?.id !== shift.id)
        .catch(() => false);
      if (hasLanded) {
        finishClose(rec, shift.openingFloat);
        return;
      }
      Alert.alert("Could not end the shift", error instanceof Error ? error.message : "Try again.");
    }
  });

  const cancelClose = () => {
    setIsClosing(false);
    setCountText("");
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
            returnKeyType="done"
            value={floatText}
            onChangeText={setFloatText}
            onSubmitEditing={() => void handleOpen()}
            editable={!busy}
            accessibilityLabel="Opening float in pesos"
          />
          <TouchableOpacity
            style={[styles.button, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void handleOpen()}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel="Start shift"
          >
            <Text style={styles.buttonLabel}>{busy ? "Starting…" : "Clock in"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const canConfirm = !busy && historyReady;

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.title}>My shift</Text>
        <Text style={styles.meta}>since {formatShiftStart(shift.openedAt)}</Text>
      </View>
      {!historyReady && (
        <Text style={historyError ? styles.warning : styles.meta}>
          {historyError ?? "Loading settlement history…"}
        </Text>
      )}
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
        <>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="Counted cash (₱)"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              returnKeyType="done"
              value={countText}
              onChangeText={setCountText}
              onSubmitEditing={() => canConfirm && void handleClose()}
              editable={!busy}
              autoFocus
              accessibilityLabel="Counted cash in pesos"
            />
            <TouchableOpacity
              style={[styles.button, !canConfirm && styles.disabled]}
              disabled={!canConfirm}
              onPress={() => void handleClose()}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm, busy }}
              accessibilityLabel="Confirm end of shift"
            >
              <Text style={styles.buttonLabel}>{busy ? "Closing…" : "Confirm"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.linkButton}
            disabled={busy}
            onPress={cancelClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel ending the shift"
          >
            <Text style={styles.linkLabel}>Cancel — keep the shift open</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={styles.ghostButton}
          onPress={() => setIsClosing(true)}
          accessibilityRole="button"
          accessibilityLabel="End shift"
        >
          <Text style={styles.ghostLabel}>End shift — count the drawer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Apple's and Material's minimum comfortable touch target. */
const MIN_TOUCH = 44;

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
  warning: { ...typography.caption, color: colors.danger },
  expected: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.xs },
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
    minHeight: MIN_TOUCH,
    flex: 1,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_TOUCH,
    minWidth: 112,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  buttonLabel: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
  ghostButton: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: MIN_TOUCH,
    marginTop: spacing.xs,
  },
  ghostLabel: { ...typography.body, color: colors.textPrimary },
  linkButton: { alignSelf: "flex-start", minHeight: MIN_TOUCH, justifyContent: "center" },
  linkLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
});
