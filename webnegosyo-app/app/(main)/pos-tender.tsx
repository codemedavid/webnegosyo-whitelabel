import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeMutation } from "../../lib/hooks";
import { useAuthStore } from "../../stores/auth-store";
import { hasLiveOrderBackend } from "../../lib/order-backend";
import { usePosCartStore } from "../../stores/pos-cart-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { listPaymentMethods } from "../../lib/pos-catalog";
import {
  isCashMethod,
  requiresProof,
  toTender,
  type PosPaymentMethod,
} from "../../lib/pos-payment-methods";
import { computeChange, quickTenderSuggestions } from "../../lib/pos-cash";
import { buildPosOrder } from "../../lib/pos-order";
import { posOutletContext } from "../../lib/order-outlet";
import { buildPosStockItems } from "../../lib/pos-stock";
import { notifyPosStockDepletion } from "../../lib/pos-stock-notify";
import { formatPeso } from "../../lib/format";
import { goTo } from "../../lib/tab-navigation";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ProofCapture, type CapturedProof } from "../../components/pos/ProofCapture";
import { SwipeToComplete } from "../../components/pos/SwipeToComplete";
import { EmptyState } from "../../components/EmptyState";
import { useOrderPrint } from "../../hooks/useOrderPrint";

const createOrderRef = "orders:createOrder" as unknown as FunctionReference<"mutation">;
const updatePaymentStatusRef =
  "orders:updatePaymentStatus" as unknown as FunctionReference<"mutation">;

export default function PosTenderScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const outletId = useAuthStore((s) => s.outletId);
  const outletName = useAuthStore((s) => s.outletName);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const hasOrderBackend = hasLiveOrderBackend({ convexUrl, orderBackend });

  const lines = usePosCartStore((s) => s.lines);
  const orderTypeId = usePosCartStore((s) => s.orderTypeId);
  const orderTypeName = usePosCartStore((s) => s.orderTypeName);
  const serviceCharge = usePosCartStore((s) => s.serviceCharge);
  const customerName = usePosCartStore((s) => s.customerName);
  const setCustomerName = usePosCartStore((s) => s.setCustomerName);
  const reset = usePosCartStore((s) => s.reset);

  const createOrder = useSafeMutation(createOrderRef);
  const updatePaymentStatus = useSafeMutation(updatePaymentStatusRef);
  const { printOrder, hasPrinter } = useOrderPrint();

  const [methods, setMethods] = useState<PosPaymentMethod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenderedText, setTenderedText] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<CapturedProof | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  // A fresh idempotency key per visit: a retry after a network blip reuses it,
  // so createOrder returns the existing order instead of charging twice.
  const [clientOrderId] = useState(
    () => `pos-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  );

  const totals = useMemo(
    () => usePosCartStore.getState().totals(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, serviceCharge],
  );

  useEffect(() => {
    if (!tenantId || !orderTypeId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    listPaymentMethods(tenantId, orderTypeId)
      .then((rows) => {
        if (cancelled) return;
        setMethods(rows);
        if (rows.length === 1) setSelectedId(rows[0].id);
      })
      .catch(() => {
        if (!cancelled) setMethods([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, orderTypeId]);

  const method = methods.find((m) => m.id === selectedId) ?? null;
  const isCash = method ? isCashMethod(method) : false;
  const needsProof = method ? requiresProof(method) : false;

  const tendered = Number.parseFloat(tenderedText);
  const change = computeChange(totals.total, Number.isNaN(tendered) ? -1 : tendered);
  const suggestions = quickTenderSuggestions(totals.total);

  // Every reason the sale cannot be completed, in the order the cashier hits them.
  const blockedReason = !method
    ? "Choose a payment method"
    : isCash && !change.isSufficient
      ? "Enter the cash received"
      : needsProof && !proof
        ? "Photograph the payment confirmation first"
        : undefined;

  const handleComplete = useCallback(async () => {
    if (!method || isCompleting) return;

    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    if (!hasOrderBackend) {
      Alert.alert("Not connected", "This store's order backend is not configured.");
      return;
    }

    setIsCompleting(true);
    try {
      const tender = toTender(method, {
        cashTendered: tendered,
        changeDue: change.changeDue,
        proofUrl: proof?.url,
        proofFileId: proof?.fileId,
        reference: reference.trim() || undefined,
      });

      const args = buildPosOrder({
        cart: lines,
        tender,
        clientOrderId,
        orderType: orderTypeName ?? undefined,
        orderTypeId: orderTypeId ?? undefined,
        serviceCharge,
        customerName,
        cashierId: userId ?? undefined,
        // A counter sale belongs to the till that rang it, so the branch on
        // the session is stamped onto the order. Null for a single-location
        // register, which stamps nothing.
        outlet: posOutletContext(outletId, outletName),
      });

      const orderId = await createOrder(args);

      // Counter sales are settled at the drawer, so they are paid on creation.
      // A failure here must not lose the sale — the order already exists.
      try {
        await updatePaymentStatus({ orderId, paymentStatus: "paid" });
      } catch (err) {
        console.warn("[pos] Could not mark the sale paid:", err);
      }

      // Spend the sale's ingredients. The order lives in Convex, so it never
      // passes through the web app's createOrderAction where depletion is
      // wired — this is the register's way into that same path. Never throws.
      if (tenantId) {
        await notifyPosStockDepletion(
          tenantId,
          String(orderId),
          buildPosStockItems(lines),
        );
      }

      if (hasPrinter) {
        await printOrder({
          _id: String(orderId),
          _creationTime: Date.now(),
          customerName: args.customerName,
          customerContact: args.customerContact,
          orderType: args.orderType,
          total: args.total,
          paymentMethod: args.paymentMethod,
          cashTendered: tender.cashTendered,
          changeDue: tender.changeDue,
          paymentReference: tender.reference,
          items: lines.map((line) => ({
            menuItemName: line.name,
            quantity: line.quantity,
            subtotal: line.subtotal,
            variationSelections: line.selections.map((s) => ({
              typeName: s.groupName,
              optionName: s.optionName,
            })),
            specialInstructions: line.note,
          })),
        });
      }

      reset();
      // navigate, not replace: replacing into a sibling tab renames the tab
      // navigator's state key and remounts it mid-transition, which crashes with
      // "Cannot read property 'stale' of undefined". See lib/tab-navigation.ts.
      goTo(router, "/(main)/pos-sales");
    } catch (err) {
      Alert.alert(
        "Could not complete the sale",
        err instanceof Error ? err.message : "Please try again.",
      );
      setIsCompleting(false);
    }
  }, [
    method,
    isCompleting,
    hasOrderBackend,
    tenantId,
    tendered,
    change.changeDue,
    proof,
    reference,
    lines,
    clientOrderId,
    orderTypeName,
    orderTypeId,
    serviceCharge,
    customerName,
    userId,
    // The branch stamped onto the sale. Listed so a session whose branch
    // resolves after this callback is first built does not keep ringing sales
    // up against a stale (or absent) branch.
    outletId,
    outletName,
    createOrder,
    updatePaymentStatus,
    hasPrinter,
    printOrder,
    reset,
  ]);

  if (lines.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState message="This sale is empty. Add items on the register first." />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>Amount due</Text>
        <Text style={styles.total}>{formatPeso(totals.total)}</Text>

        <TextInput
          style={styles.nameInput}
          placeholder="Customer name (optional)"
          placeholderTextColor={colors.textTertiary}
          value={customerName}
          onChangeText={setCustomerName}
        />

        <Text style={styles.sectionTitle}>Payment method</Text>
        {methods.length === 0 ? (
          <EmptyState message="No payment methods are enabled for this order type. Add one in Store Setup." />
        ) : (
          <View style={styles.methodRow}>
            {methods.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.method, selectedId === m.id && styles.methodActive]}
                onPress={() => {
                  setSelectedId(m.id);
                  setProof(null);
                  setReference("");
                }}
              >
                <Text
                  style={[styles.methodText, selectedId === m.id && styles.methodTextActive]}
                >
                  {m.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {method && isCash && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cash received</Text>
            <TextInput
              style={styles.cashInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              value={tenderedText}
              onChangeText={setTenderedText}
            />
            <View style={styles.suggestions}>
              {suggestions.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.suggestion}
                  onPress={() => setTenderedText(amount.toFixed(2))}
                >
                  <Text style={styles.suggestionText}>{formatPeso(amount)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.changeBox, change.isSufficient && styles.changeBoxReady]}>
              <Text style={styles.changeLabel}>Change</Text>
              <Text style={styles.changeAmount}>{formatPeso(change.changeDue)}</Text>
            </View>
          </View>
        )}

        {method && !isCash && (
          <View style={styles.section}>
            {method.qr_code_url ? (
              <>
                <Text style={styles.sectionTitle}>Show this to the customer</Text>
                <Image
                  source={{ uri: method.qr_code_url }}
                  style={styles.qr}
                  resizeMode="contain"
                  alt={`${method.name} payment QR code`}
                  accessibilityLabel={`${method.name} payment QR code`}
                />
              </>
            ) : null}
            {method.details ? <Text style={styles.details}>{method.details}</Text> : null}

            <TextInput
              style={styles.nameInput}
              placeholder="Reference number (optional)"
              placeholderTextColor={colors.textTertiary}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
            />
          </View>
        )}

        {method && needsProof && (
          <ProofCapture
            proof={proof}
            onCaptured={setProof}
            onError={(message) => Alert.alert("Capture failed", message)}
          />
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isCompleting ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <SwipeToComplete
            label={`Swipe to complete  ${formatPeso(totals.total)}`}
            blockedReason={blockedReason}
            disabled={blockedReason !== undefined}
            onComplete={handleComplete}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingTop: 60, gap: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  total: { fontSize: 40, fontWeight: "800", color: colors.textPrimary },
  sectionTitle: { ...typography.eyebrow, color: colors.textSecondary, marginTop: spacing.lg },
  section: { marginTop: spacing.sm },
  nameInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  method: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  methodActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  methodText: { ...typography.body, color: colors.textSecondary },
  methodTextActive: { color: colors.accent, fontWeight: "700" },
  cashInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  suggestion: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  suggestionText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  changeBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  changeBoxReady: { backgroundColor: colors.successLight },
  changeLabel: { ...typography.eyebrow, color: colors.textSecondary },
  changeAmount: { fontSize: 32, fontWeight: "800", color: colors.textPrimary },
  qr: {
    width: "100%",
    height: 260,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  details: { ...typography.body, color: colors.textPrimary, marginTop: spacing.md },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.card,
  },
});
