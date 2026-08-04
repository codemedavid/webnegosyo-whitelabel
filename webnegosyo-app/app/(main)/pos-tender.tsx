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
import { hasLiveOrderBackend, resolveOrderBackend } from "../../lib/order-backend";
import { usePosCartStore } from "../../stores/pos-cart-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { listAllPaymentMethods, listPaymentMethods } from "../../lib/pos-catalog";
import { editModeTotals } from "../../lib/pos-edit-mode";
import { canIssueRefund } from "../../lib/order-edit-guards";
import { posCartToOrderItems } from "../../lib/order-edit-cart";
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
import { notifyPosStockDepletion, notifyOrderStockRevision } from "../../lib/pos-stock-notify";
import { notifyCustomerCapture } from "../../lib/customers/capture";
import { burnPosRedemptions } from "../../lib/voucher-service";
import { posCustomerFields, attachmentSummary } from "../../lib/customers/pos-attachment";
import { CustomerPickerSheet } from "../../components/pos/CustomerPickerSheet";
import { posStockRevision } from "../../lib/pos-stock-revision";
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
const reviseOrderRef = "orders:reviseOrder" as unknown as FunctionReference<"mutation">;
const recordPaymentRef = "orders:recordPayment" as unknown as FunctionReference<"mutation">;

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
  const attachedCustomer = usePosCartStore((s) => s.attachedCustomer);
  const setAttachedCustomer = usePosCartStore((s) => s.setAttachedCustomer);
  const reset = usePosCartStore((s) => s.reset);
  const editContext = usePosCartStore((s) => s.editContext);
  const endEdit = usePosCartStore((s) => s.endEdit);

  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);

  const createOrder = useSafeMutation(createOrderRef);
  const updatePaymentStatus = useSafeMutation(updatePaymentStatusRef);
  const reviseOrder = useSafeMutation(reviseOrderRef);
  const recordPayment = useSafeMutation(recordPaymentRef);
  const { printOrder, hasPrinter } = useOrderPrint();

  const [methods, setMethods] = useState<PosPaymentMethod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenderedText, setTenderedText] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<CapturedProof | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  /** Why the order was changed. Edit mode only; written to the audit row. */
  const [editReason, setEditReason] = useState("");

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

  // Editing a placed order: what it is now worth, and what still has to move.
  // Every part of that judgement lives in `pos-edit-mode.ts` and is tested.
  const edit = useMemo(
    () => (editContext ? editModeTotals(lines, editContext) : null),
    [lines, editContext],
  );

  const isRefund = edit?.intent === "refund";
  const isAlreadySettled = edit?.intent === "settled";
  // The difference to settle when editing; the whole sale otherwise.
  const amountDue = edit ? Math.abs(edit.balance) : totals.total;

  const refundGate = useMemo(
    () => canIssueRefund({ role, isOwner, permissions }),
    [role, isOwner, permissions],
  );

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }
    // An edit is settled against ANY method, not the ones the original order
    // type allows: a GCash delivery order topped up at the counter is paid in
    // cash, and refusing that would strand the cashier.
    if (!editContext && !orderTypeId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    const load = editContext
      ? listAllPaymentMethods(tenantId)
      : listPaymentMethods(tenantId, orderTypeId as string);

    load
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
  }, [tenantId, orderTypeId, editContext]);

  const method = methods.find((m) => m.id === selectedId) ?? null;
  const isCash = method ? isCashMethod(method) : false;
  const needsProof = method ? requiresProof(method) : false;

  const tendered = Number.parseFloat(tenderedText);
  const change = computeChange(amountDue, Number.isNaN(tendered) ? -1 : tendered);
  const suggestions = quickTenderSuggestions(amountDue);

  // A refund hands money OUT of the drawer, so there is nothing to tender and
  // no change to compute — the cash pad would be asking the wrong question.
  const wantsCashPad = isCash && !isRefund && !isAlreadySettled;

  // Every reason the sale cannot be completed, in the order the cashier hits
  // them. A settled edit needs no payment at all, so it skips the lot.
  const blockedReason = isAlreadySettled
    ? undefined
    : isRefund && !refundGate.allowed
      ? refundGate.reason
      : !method
        ? "Choose a payment method"
        : wantsCashPad && !change.isSufficient
          ? "Enter the cash received"
          : needsProof && !isRefund && !proof
            ? "Photograph the payment confirmation first"
            : undefined;

  /**
   * Save an edited order and settle the difference.
   *
   * Two writes, deliberately not one: `reviseOrder` rewrites the bill and
   * `recordPayment` appends to the ledger. The revise must land first — a
   * payment recorded against the old total would settle a bill that no longer
   * exists. If the payment then fails the order is still correctly revised and
   * simply shows an outstanding balance, which the cashier can settle again.
   * The reverse order would leave money recorded against a stale bill.
   */
  const handleSaveEdit = useCallback(async () => {
    if (!editContext || !edit || isCompleting) return;

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
      // Derived here rather than read from the render memo, so the figure saved
      // is the one these exact lines produce. `carriedCharges` on its own is
      // NOT it: the re-priced discount has to be folded in, or a discounted
      // order would be saved at full price and the customer re-charged the
      // discount they were given.
      const saved = editModeTotals(lines, editContext);

      await reviseOrder({
        orderId: editContext.orderId,
        expectedRevisionNumber: editContext.expectedRevisionNumber,
        items: posCartToOrderItems(lines),
        deliveryFee: editContext.deliveryFee,
        // The only channel the mutation offers for the rest of the bill.
        serviceChargeAmount: saved.carriedChargesForSave,
        reason: editReason.trim() || undefined,
        revisedBy: userId ?? undefined,
        editedAt: new Date().toISOString(),
      });

      // An edit that swapped one item for another of the same price is complete
      // the moment it saves; writing a zero-amount ledger row would be noise.
      if (edit.intent !== "settled") {
        await recordPayment({
          orderId: editContext.orderId,
          kind: edit.intent === "refund" ? "refund" : "charge",
          // Unsigned — `kind` carries the direction. A signed refund amount
          // would double-negate and credit the customer twice.
          amount: Math.abs(edit.balance),
          paymentMethodId: method?.id,
          paymentMethodName: method?.name,
          reference: reference.trim() || undefined,
          proofUrl: proof?.url,
          recordedBy: userId ?? undefined,
          outletId: outletId ?? undefined,
        });
      }

      // Move only the ingredients the edit is responsible for. The original
      // sale already spent the order's stock, so this is the difference in
      // both directions — an edit can add a latte and drop a bun at once.
      //
      // Claimed against the revision this save just wrote, so a retry is a
      // no-op while the NEXT edit still moves stock. Never throws: the bill is
      // already rewritten and the money settled by this point.
      if (tenantId) {
        await notifyOrderStockRevision(
          tenantId,
          editContext.orderId,
          editContext.expectedRevisionNumber + 1,
          posStockRevision(editContext.originalStockItems, buildPosStockItems(lines)),
        );
      }

      endEdit();
      router.back();
    } catch (err) {
      Alert.alert(
        "Could not save the order",
        err instanceof Error ? err.message : "The edit was not saved.",
      );
      setIsCompleting(false);
    }
  }, [
    editContext,
    edit,
    isCompleting,
    hasOrderBackend,
    tenantId,
    lines,
    editReason,
    userId,
    method,
    reference,
    proof,
    outletId,
    reviseOrder,
    recordPayment,
    endEdit,
  ]);

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

      // Read at tender time rather than held in state: the engine re-prices
      // against the current cart, so a line voided after a code was typed is
      // reflected in what the customer is actually charged.
      const discountLines = usePosCartStore.getState().sessionDiscount().lines;

      const args = buildPosOrder({
        cart: lines,
        tender,
        clientOrderId,
        orderType: orderTypeName ?? undefined,
        orderTypeId: orderTypeId ?? undefined,
        serviceCharge,
        // The attached guest's contact is what makes this sale land on their
        // profile — `buildPosOrder` has always accepted `customerContact` and
        // nothing ever passed it, so every counter sale went out anonymous.
        ...posCustomerFields(attachedCustomer, customerName),
        cashierId: userId ?? undefined,
        // Priced from the cart as it stands at the moment of tender, not from
        // whatever was showing when the code was typed.
        discounts: discountLines,
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

        // Burn what this sale used. The register cannot call redeem_voucher()
        // itself — it is service_role only — so this goes through the web app
        // on the cashier's own token. Never throws: the customer has already
        // paid, and the burn is keyed on the order id so a retry is a no-op.
        await burnPosRedemptions(
          tenantId,
          String(orderId),
          discountLines,
          outletId,
        );
      }

      // Roll the sale into its guest's profile. Same reasoning as depletion
      // above: counter sales reach none of the web app's order actions, which
      // are the only places customer capture is wired, so without this a POS
      // sale is invisible to the Regulars list. Skips itself for an anonymous
      // walk-in, and never throws.
      if (tenantId) {
        await notifyCustomerCapture(tenantId, {
          backend: resolveOrderBackend({
            order_backend: orderBackend,
            convex_deployment_url: convexUrl,
          }),
          orderId: String(orderId),
          name: args.customerName,
          contact: args.customerContact,
          customerData: args.customerData,
          total: args.total,
          createdAt: new Date().toISOString(),
          channel: args.orderType ?? null,
          items: lines.map((line) => ({
            name: line.name,
            quantity: line.quantity,
          })),
        });
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
    // Without this the callback closes over the attachment as it was when the
    // screen last rendered, so a guest picked and then immediately charged
    // would ring up against whoever was attached before them.
    attachedCustomer,
    userId,
    // The branch stamped onto the sale. Listed so a session whose branch
    // resolves after this callback is first built does not keep ringing sales
    // up against a stale (or absent) branch.
    outletId,
    outletName,
    // Which backend wrote the order, which decides how its guest is captured.
    // Listed for the same reason as the branch: a session that resolves its
    // backend late must not keep capturing sales against a stale answer.
    convexUrl,
    orderBackend,
    createOrder,
    updatePaymentStatus,
    hasPrinter,
    printOrder,
    reset,
  ]);

  if (lines.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          message={
            editContext
              ? "An order cannot be emptied by editing. Cancel it instead."
              : "This sale is empty. Add items on the register first."
          }
        />
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
        <Text style={styles.eyebrow}>
          {isAlreadySettled
            ? "Nothing to settle"
            : isRefund
              ? "Refund due"
              : "Amount due"}
        </Text>
        <Text style={styles.total}>{formatPeso(amountDue)}</Text>

        {edit && editContext && (
          <Text style={styles.editMeta}>
            This order was {formatPeso(editContext.originalTotal)} and is now{" "}
            {formatPeso(edit.newTotal)}.
          </Text>
        )}

        {edit ? (
          <TextInput
            style={styles.nameInput}
            placeholder="Reason for the change (optional)"
            placeholderTextColor={colors.textTertiary}
            value={editReason}
            onChangeText={setEditReason}
          />
        ) : (
          <>
            <TextInput
              style={styles.nameInput}
              placeholder="Customer name (optional)"
              placeholderTextColor={colors.textTertiary}
              value={customerName}
              onChangeText={setCustomerName}
              // An attached guest's name is what goes on the order, so leaving
              // this editable would show the cashier a name the sale will not use.
              editable={attachedCustomer === null}
            />
            <TouchableOpacity
              style={styles.customerRow}
              onPress={() => setIsPickerOpen(true)}
              accessibilityRole="button"
            >
              <Text style={styles.customerLabel}>Customer</Text>
              <Text
                style={
                  attachedCustomer ? styles.customerValue : styles.customerValueMuted
                }
              >
                {attachmentSummary(attachedCustomer)}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {isAlreadySettled ? null : (
        <>
        <Text style={styles.sectionTitle}>
          {isRefund ? "Refund via" : "Payment method"}
        </Text>
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

        {method && wantsCashPad && (
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

        {method && (!isCash || isRefund) && (
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

        {/*
          Proof is the customer's confirmation that they paid. A refund moves
          money the other way, so there is nothing for them to screenshot.
        */}
        {method && needsProof && !isRefund && (
          <ProofCapture
            proof={proof}
            onCaptured={setProof}
            onError={(message) => Alert.alert("Capture failed", message)}
          />
        )}
        </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isCompleting ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <SwipeToComplete
            label={
              isAlreadySettled
                ? "Swipe to save the changes"
                : isRefund
                  ? `Swipe to refund  ${formatPeso(amountDue)}`
                  : edit
                    ? `Swipe to save and collect  ${formatPeso(amountDue)}`
                    : `Swipe to complete  ${formatPeso(amountDue)}`
            }
            blockedReason={blockedReason}
            disabled={blockedReason !== undefined}
            onComplete={edit ? handleSaveEdit : handleComplete}
          />
        )}
      </View>

      <CustomerPickerSheet
        visible={isPickerOpen}
        tenantId={tenantId ?? ""}
        onCancel={() => setIsPickerOpen(false)}
        onPick={(customer) => {
          setAttachedCustomer(customer);
          setIsPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingTop: 60, gap: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  editMeta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
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
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  customerLabel: { ...typography.caption, color: colors.textSecondary },
  customerValue: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  customerValueMuted: { ...typography.body, color: colors.textTertiary, flexShrink: 1 },
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
