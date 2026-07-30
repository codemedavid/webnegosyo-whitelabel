import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeQuery, useSafeMutation } from "../../../lib/hooks";
import { colors, typography, spacing, radius } from "../../../theme/colors";
import { Card } from "../../../components/Card";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { formatPeso } from "../../../lib/format";
import { listAllPaymentMethods } from "../../../lib/pos-catalog";
import type { PosPaymentMethod } from "../../../lib/pos-payment-methods";
import { summarizeSettlement, type OrderPaymentLike } from "../../../lib/order-history-view";
import { canIssueRefund } from "../../../lib/order-edit-guards";

/**
 * Collect the difference an edit created, or return it.
 *
 * Thin over `order-history-view.ts` / `order-balance.ts`: how much is owed and
 * in which direction is decided there, tested, and shared with the order detail
 * card, so the two can never tell the cashier different numbers.
 */

const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;
const getOrderPaymentsRef = "orders:getOrderPayments" as unknown as FunctionReference<"query">;
const recordPaymentRef = "orders:recordPayment" as unknown as FunctionReference<"mutation">;

interface SettleableOrder {
  _id: string;
  total: number;
}

export default function OrderSettleScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const userId = useAuthStore((s) => s.userId);
  const { isOwner, permissions, role } = useAuthStore();

  const { data: order, isLoading, error } = useSafeQuery<SettleableOrder | null>(
    getOrderByIdRef,
    orderId ? { orderId } : "skip",
  );
  const { data: payments, error: paymentsError } = useSafeQuery<OrderPaymentLike[]>(
    getOrderPaymentsRef,
    orderId ? { orderId } : "skip",
  );
  const recordPayment = useSafeMutation(recordPaymentRef);

  const [methods, setMethods] = useState<PosPaymentMethod[]>([]);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    listAllPaymentMethods(tenantId)
      .then((rows) => {
        if (cancelled) return;
        setMethods(rows);
        setMethodId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => {
        // A missing method list must not block settlement — the cashier can
        // still record the movement without naming how it was taken.
        if (!cancelled) setMethods([]);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const summary = useMemo(
    () => (order ? summarizeSettlement(order.total, payments ?? []) : null),
    [order, payments],
  );

  const refundGate = canIssueRefund({ role, isOwner, permissions });
  const isRefund = summary?.intent === "refund";
  const selectedMethod = methods.find((m) => m.id === methodId);

  async function handleRecord() {
    if (!order || !summary || summary.intent === "settled") return;

    if (isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }

    if (isRefund && !refundGate.allowed) {
      Alert.alert("Not allowed", refundGate.reason ?? "You cannot issue refunds.");
      return;
    }

    setIsSaving(true);
    try {
      await recordPayment({
        orderId: order._id,
        kind: isRefund ? "refund" : "charge",
        // Always positive — `kind` carries the direction.
        amount: Math.abs(summary.balance),
        paymentMethodId: selectedMethod?.id,
        paymentMethodName: selectedMethod?.name,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        recordedBy: userId ?? undefined,
      });
      router.back();
    } catch (err) {
      Alert.alert(
        "Could not record",
        err instanceof Error ? err.message : "The settlement was not recorded.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (error || paymentsError) {
    return (
      <View style={styles.screen}>
        <ErrorState message={error ?? paymentsError ?? "Unavailable"} onRetry={() => router.back()} />
      </View>
    );
  }

  if (isLoading || !order || !summary) {
    return <LoadingState fullScreen message="Loading settlement..." />;
  }

  if (summary.intent === "settled") {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.heading}>Nothing to settle</Text>
          <Text style={styles.sub}>This order is fully paid.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // A refund is the one action here that cannot be undone by editing again, so
  // the block is stated plainly instead of leaving a dead button on screen.
  if (isRefund && !refundGate.allowed) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.heading}>Refund due</Text>
          <Text style={styles.amount}>{summary.balanceLabel}</Text>
          <Text style={styles.sub}>{refundGate.reason}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>{isRefund ? "Refund due" : "Collect"}</Text>
        <Text style={[styles.amount, { color: isRefund ? colors.warning : colors.success }]}>
          {summary.balanceLabel}
        </Text>

        <Card title="This order" style={styles.card}>
          <Row label="Bill total" value={formatPeso(order.total)} />
          <Row label="Charged so far" value={formatPeso(summary.totalCharged)} />
          {summary.totalRefunded > 0 && (
            <Row label="Refunded" value={formatPeso(summary.totalRefunded)} />
          )}
          <Row label="Net paid" value={formatPeso(summary.amountPaid)} />
        </Card>

        <Card title={isRefund ? "Refund by" : "Collect by"} style={styles.card}>
          {methods.length === 0 ? (
            <Text style={styles.sub}>No payment methods configured.</Text>
          ) : (
            methods.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[styles.method, methodId === method.id && styles.methodActive]}
                onPress={() => setMethodId(method.id)}
              >
                <Text style={styles.methodName}>{method.name}</Text>
                {methodId === method.id && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))
          )}
        </Card>

        <Card title="Reference (optional)" style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="e.g. GCash ref no."
            placeholderTextColor={colors.textTertiary}
            value={reference}
            onChangeText={setReference}
          />
        </Card>

        <Card title="Note (optional)" style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Anything worth recording"
            placeholderTextColor={colors.textTertiary}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, isSaving && styles.disabled]}
          disabled={isSaving}
          onPress={handleRecord}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving
              ? "Recording..."
              : `${isRefund ? "Record refund of" : "Record payment of"} ${summary.balanceLabel}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60, paddingBottom: 140 },
  backButton: { marginBottom: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  heading: { ...typography.title, color: colors.textPrimary },
  amount: { ...typography.title, fontSize: 40, fontWeight: "800", marginBottom: spacing.lg },
  sub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  card: { marginBottom: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs },
  rowLabel: { ...typography.body, color: colors.textSecondary },
  rowValue: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  method: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    marginBottom: spacing.sm,
  },
  methodActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  methodName: { ...typography.body, color: colors.textPrimary },
  check: { ...typography.body, color: colors.primary, fontWeight: "800" },
  input: { ...typography.body, color: colors.textPrimary, minHeight: 40 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabled: { opacity: 0.4 },
  primaryButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});
