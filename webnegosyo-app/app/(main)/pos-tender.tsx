import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FunctionReference } from "convex/server";
import { useSafeMutation } from "../../lib/hooks";
import { hasPermission } from "../../lib/staff-permissions";
import { isLoyaltyPosEnabled, readPendingLoyaltySale, readReservedLoyaltyQuote } from "../../lib/loyalty/pos-api";
import { useAuthStore } from "../../stores/auth-store";
import { hasLiveOrderBackend, resolveOrderBackend } from "../../lib/order-backend";
import { usePosCartStore } from "../../stores/pos-cart-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { canIssueRefund } from "../../lib/order-edit-guards";
import { posCartToOrderItems } from "../../lib/order-edit-cart";
import {
  isCashMethod,
  isProofOutstanding,
  requiresProof,
  toTender,
} from "../../lib/pos-payment-methods";
import { computeChange, quickTenderSuggestions } from "../../lib/pos-cash";
import { buildPosOrder } from "../../lib/pos-order";
import { posReceiptOrder } from "../../lib/pos-receipt";
import { staleBackendMessage } from "../../lib/stale-backend";
import { convexServiceChargeArg } from "../../lib/convex-service-charge-arg";
import { resolveRegisterOutlet } from "../../lib/register-outlet";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { buildPosStockItems } from "../../lib/pos-stock";
import { notifyOrderStockRevision } from "../../lib/pos-stock-notify";
import { posLinesToLoyverseOrderLines } from "../../lib/loyverse-notify";
import { burnPosRedemptions } from "../../lib/voucher-service";
import { placeCounterSale } from "../../lib/offline/place-sale";
import { newLocalOrderId } from "../../lib/offline/local-id";
import { runPosSaleBookkeeping } from "../../lib/offline/pos-sale-bookkeeping";
import { isOffline } from "../../lib/offline/connectivity";
import { isNetworkFailure } from "../../lib/offline/network-error";
import { useTenderPaymentMethods } from "../../lib/query/use-tender-payment-methods";
import {
  canOfferPayLater,
  describeCompletedSale,
  tenderBlockedReason,
  tenderSwipeLabel,
  type TenderMode,
} from "../../lib/pos-tender-mode";
import { usePosLastSaleStore } from "../../stores/pos-last-sale-store";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Icon } from "../../components/Icon";
import { effectiveEditCart, newDiscountLines } from "../../lib/pos-edit-mode";
import { posCustomerFields, attachmentSummary } from "../../lib/customers/pos-attachment";
import { CustomerPickerSheet } from "../../components/pos/CustomerPickerSheet";
import { posStockRevision } from "../../lib/pos-stock-revision";
import { freshTenderSession } from "../../lib/pos-tender-session";
import { usePosSaleTotals } from "../../lib/use-pos-sale-totals";
import { formatPeso } from "../../lib/format";
import { goTo } from "../../lib/tab-navigation";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ProofCapture, type CapturedProof } from "../../components/pos/ProofCapture";
import { SwipeToComplete } from "../../components/pos/SwipeToComplete";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { useOrderPrint } from "../../hooks/useOrderPrint";
import { printPosKitchenChit, readPosKitchenPrintDeps } from "../../lib/pos-kitchen-print";

const createOrderRef = "orders:createOrder" as unknown as FunctionReference<"mutation">;
const updatePaymentStatusRef =
  "orders:updatePaymentStatus" as unknown as FunctionReference<"mutation">;
const reviseOrderRef = "orders:reviseOrder" as unknown as FunctionReference<"mutation">;
const recordPaymentRef = "orders:recordPayment" as unknown as FunctionReference<"mutation">;

const TENDER_MODE_OPTIONS = [
  { label: "Pay now", value: "now" as TenderMode },
  { label: "Pay later", value: "later" as TenderMode },
] as const;

/**
 * Post-sale bookkeeping (stock, Loyverse, vouchers, guest capture, receipt)
 * runs after the cashier has the till back. None of it can fail the sale —
 * the order is already saved — so a failure is logged, never shown.
 */
async function settleSaleInBackground(settle: () => Promise<void>): Promise<void> {
  try {
    await settle();
  } catch (err) {
    console.warn("[pos] Post-sale bookkeeping failed:", err);
  }
}

export default function PosTenderScreen() {
  // The store the sale belongs to, impersonation included: every mutation
  // and the outbox replay scope the same way, and a superadmin inside a
  // store has no tenant of their own to fall back on.
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const saleOutlet = usePosCartStore((s) => s.saleOutlet);
  const editing = usePosCartStore((s) => s.editContext);
  const outletId = editing ? editing.outletId ?? null : saleOutlet?.id ?? null;
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const convexSchemaVersion = useAuthStore((s) => s.convexSchemaVersion);

  /**
   * The `serviceCharge` argument to send with an order write, if any.
   *
   * The platform backend has a real column and takes it whatever the version;
   * only Convex validates its arguments strictly, so only Convex is gated.
   */
  const serviceChargeArg = useCallback(
    (amount: number | undefined) =>
      orderBackend === "supabase"
        ? amount && amount > 0
          ? { serviceCharge: amount }
          : {}
        : convexServiceChargeArg(amount, convexSchemaVersion),
    [orderBackend, convexSchemaVersion],
  );
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
  const { printOrder, shouldPrint } = useOrderPrint();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tenderedText, setTenderedText] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<CapturedProof | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  /** Why the order was changed. Edit mode only; written to the audit row. */
  const [editReason, setEditReason] = useState("");
  /** Take the money now, or place the order unpaid and collect it later. */
  const [mode, setMode] = useState<TenderMode>("now");
  const showLastSale = usePosLastSaleStore((s) => s.show);

  // A fresh idempotency key per visit: a retry after a network blip reuses it,
  // so createOrder returns the existing order instead of charging twice.
  const [clientOrderId, setClientOrderId] = useState(
    () => freshTenderSession().clientOrderId,
  );

  // This is a hidden TAB screen: it mounts once and is never unmounted by
  // navigation, so per-sale state initialized at mount is really per-launch.
  // Without this reset, a completed sale left `isCompleting` true forever
  // (the next checkout showed only the footer spinner — a frozen register)
  // and every later sale reused the first sale's idempotency key, deduping
  // it into the first order. Focus, not mount, is the start of a sale here.
  useFocusEffect(
    useCallback(() => {
      const session = freshTenderSession();
      setClientOrderId(session.clientOrderId);
      setIsCompleting(session.isCompleting);
      setTenderedText(session.tenderedText);
      setReference(session.reference);
      setProof(session.proof);
      setEditReason(session.editReason);
      setMode(session.mode);
    }, []),
  );

  // Re-priced on every store change. This tab stays mounted between sales, so
  // a hand-kept dependency list that missed the discount showed the full
  // price here after a voucher was applied on the register.
  // Editing a placed order: `edit` is what it is now worth, and what still has
  // to move. Every part of that judgement lives in `pos-edit-mode.ts`.
  const { totals, discountLines: shownDiscountLines, edit } = usePosSaleTotals();

  const isRefund = edit?.intent === "refund";
  const isAlreadySettled = edit?.intent === "settled";
  // The difference to settle when editing; the whole sale otherwise.
  const amountDue = edit ? Math.abs(edit.balance) : totals.total;

  const refundGate = useMemo(
    () => canIssueRefund({ role, isOwner, permissions }),
    [role, isOwner, permissions],
  );

  // Cached per order type and warmed by the register while items are still
  // being added, so Charge opens on the amount due rather than a spinner.
  // An edit settles against ANY method (see use-tender-payment-methods.ts).
  const {
    methods,
    isLoading: isLoadingMethods,
    error: methodsError,
    refetch: refetchMethods,
  } = useTenderPaymentMethods(
    tenantId,
    orderTypeId,
    editContext !== null,
  );

  // One method means no choice to make: pre-select it. Re-checked whenever the
  // list changes, and only while nothing (or a method that has since gone) is
  // selected, so a cashier's own pick is never overwritten.
  useEffect(() => {
    const isSelectionValid = methods.some((candidate) => candidate.id === selectedId);
    if (!isSelectionValid) setSelectedId(methods.length === 1 ? methods[0].id : null);
  }, [methods, selectedId]);

  const isPayLaterOffered = canOfferPayLater({ isEditing: editContext !== null });
  const isPayLater = isPayLaterOffered && mode === "later";

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
  // them. A settled edit needs no payment at all, and a pay-later sale takes
  // none now — see `pos-tender-mode.ts`.
  const blockedReason = tenderBlockedReason({
    mode: isPayLater ? "later" : "now",
    isAlreadySettled,
    isRefund,
    refundGate,
    hasMethod: method !== null,
    wantsCashPad,
    isCashSufficient: change.isSufficient,
    isProofOutstanding:
      method !== null &&
      isProofOutstanding(method, { reference, hasProof: proof !== null }),
  });

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
      // Read back from the store, not recomputed: the figure saved must be the
      // one the register showed, discounts applied during the edit included.
      const saved = usePosCartStore.getState().editTotals()!;

      // The ORDER's lines, which on an append are not the register's: the
      // cashier rang up only the second round, and saving that alone would
      // replace the table's whole bill with it. Same rule the totals used, so
      // what is saved is what the cashier was shown.
      const savedItems = effectiveEditCart(lines, editContext);

      await reviseOrder({
        orderId: editContext.orderId,
        expectedRevisionNumber: editContext.expectedRevisionNumber,
        items: posCartToOrderItems(savedItems),
        deliveryFee: editContext.deliveryFee,
        // The only channel the mutation offers for the rest of the bill.
        serviceChargeAmount: saved.carriedChargesForSave,
        // The NAMED charge, so the next reader can caption the row instead of
        // finding an unexplained gap. A record only — the money above already
        // includes it, and sending it as a second addend would bill twice.
        //
        // Version-gated on Convex: a deployment below v23 rejects the whole
        // mutation over the unknown field, so an ungated send would stop every
        // un-redeployed store from saving an edit at all.
        ...serviceChargeArg(editContext.serviceCharge),
        reason: editReason.trim() || undefined,
        revisedBy: userId ?? undefined,
        editedAt: new Date().toISOString(),
        // What the edit settled on, so the order's discount rows and its total
        // stay reconcilable. Omitted entirely when the edit touched no
        // discount — see `settledDiscount`.
        ...(saved.settledDiscount !== undefined
          ? { discount: saved.settledDiscount }
          : {}),
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
          posStockRevision(editContext.originalStockItems, buildPosStockItems(savedItems)),
          "pos",
        );
      }

      // Burn the codes THIS edit added. The order's own codes were burned when
      // it was placed; burning them again would spend a second redemption from
      // the customer's allowance on every subsequent edit. Never throws — the
      // bill is already rewritten and the money settled by this point.
      if (tenantId) {
        await burnPosRedemptions(
          tenantId,
          editContext.orderId,
          newDiscountLines(
            usePosCartStore.getState().sessionDiscount().lines,
            editContext.storedDiscount?.lines ?? [],
          ),
          outletId,
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
    serviceChargeArg,
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
    if (isCompleting) return;
    // A pay-later sale needs no method; a paid one cannot go without.
    if (!isPayLater && !method) return;

    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    if (!hasOrderBackend) {
      Alert.alert("Not connected", "This store's order backend is not configured.");
      return;
    }

    const selection = useBranchContextStore.getState();
    const currentOutlet = resolveRegisterOutlet(useAuthStore.getState(), selection);
    if ((selection.knownOutletIds?.length ?? 0) > 0 && !saleOutlet) {
      Alert.alert("Choose a branch", "Select a branch and start a new sale before taking payment.");
      return;
    }
    if ((currentOutlet?.id ?? null) !== (saleOutlet?.id ?? null)) {
      Alert.alert("Branch changed", "Return to the branch where this sale started, or clear the cart and start a new sale.");
      return;
    }

    setIsCompleting(true);
    try {
      if (tenantId && userId) {
        // Both are local disk reads; read together rather than one after the other.
        const [pendingLoyaltySale, reservedQuote] = await Promise.all([
          readPendingLoyaltySale(tenantId, userId),
          readReservedLoyaltyQuote(tenantId, userId),
        ]);
        if (pendingLoyaltySale || reservedQuote) {
          setIsCompleting(false);
          router.push("/(main)/pos-loyalty");
          return;
        }
      }
      // `null` for a pay-later sale: nothing has been handed over yet, so no
      // method, cash, change or proof may be claimed on the order.
      const tender =
        isPayLater || !method
          ? null
          : toTender(method, {
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
        // Read at tender time for the same reason as the discount lines: the
        // fee the customer is charged is whatever the sale holds NOW.
        delivery: usePosCartStore.getState().delivery,
        // The table, likewise, is whatever the sale holds at tender.
        table: usePosCartStore.getState().table,
        // Keep the branch that supplied the cart's prices and stock.
        outlet: saleOutlet,
      });

      if (!tenantId) throw new Error("No store selected");

      // `buildPosOrder` reports the charge unconditionally; the gate decides
      // whether this particular deployment can be told about it.
      const { serviceCharge: builtCharge, ...rest } = args;
      const backend = resolveOrderBackend({
        order_backend: orderBackend,
        convex_deployment_url: convexUrl,
      });
      const isPlatform = backend === "platform";
      const isPaidNow = tender !== null;
      const localId = newLocalOrderId();
      const createdAt = Date.now();
      // The platform database keeps the id the register prints and the moment
      // the sale was taken, so a sale written later lands on the right day
      // under the id on the customer's receipt. Convex validates its arguments
      // strictly, so these fields stay platform-only. A paid sale carries its
      // payment on the insert itself; a pay-later sale is inserted unpaid.
      const platformFields = isPlatform
        ? {
            id: localId,
            createdAt: new Date(createdAt).toISOString(),
            ...(isPaidNow ? { paymentStatus: "paid" as const } : {}),
          }
        : {};
      const orderArgs = { ...rest, ...serviceChargeArg(builtCharge), ...platformFields };
      // Everything the sale owes the platform after the row exists, computed
      // NOW from the cart, so a sale written behind reports exactly what a
      // live one would (lib/offline/pos-sale-bookkeeping.ts).
      const bookkeeping = {
        stockItems: buildPosStockItems(lines),
        loyverseLines: posLinesToLoyverseOrderLines(lines),
        discountLines: [...discountLines],
        outletId,
        total: args.total,
        customerName: args.customerName,
        customerContact: args.customerContact,
        customerData: args.customerData,
        channel: args.orderType ?? null,
        captureItems: lines.map((line) => ({ name: line.name, quantity: line.quantity })),
      };

      // The platform register does not wait on the server: the id is minted
      // here, so the sale is complete the moment it is on this device and the
      // outbox writes it in the background (moments later, or after an
      // outage). Convex mints its own ids, so it is still written first and
      // only kept locally when the server cannot be reached. A refusal throws
      // to the alert below either way (lib/offline/place-sale.ts).
      const outcome = await placeCounterSale({
        createOrder,
        writeBehind: isPlatform,
        sale: {
          localId,
          tenantId,
          backend,
          clientOrderId,
          createdAt,
          orderArgs,
          bookkeeping,
          paidAtTender: isPaidNow,
        },
      });
      const orderId = outcome.kind === "written" ? outcome.orderId : outcome.localId;
      // Written behind on the platform, the row will exist under this id in a
      // moment; a sale kept only because the connection is down will not.
      const isSavedOffline = outcome.kind === "queued" && (!isPlatform || isOffline());

      // Paper starts NOW, before anything else. A paid counter sale prints its
      // receipt under every trigger except "never". A pay-later order prints
      // no receipt yet — its bill prints when it is collected from the order
      // screen, with the cash and change on it.
      const receiptPrinted =
        tender && shouldPrint("counterSale")
          ? printOrder(posReceiptOrder(String(orderId), args, tender, createdAt))
          : Promise.resolve(false);
      // The kitchen chit too, from the lines this register already holds,
      // instead of waiting for the auto-print watcher to hear about the sale
      // from the server.
      void printPosKitchenChit(
        String(orderId),
        args,
        createdAt,
        readPosKitchenPrintDeps(useAuthStore.getState().isDemo),
      );

      // Hand the till back NOW: an empty register, ready for the next customer,
      // with a line saying what just happened. Everything below is bookkeeping
      // the cashier never needs to watch.
      showLastSale({
        orderId: String(orderId),
        notice: describeCompletedSale({
          total: args.total,
          changeDue: tender?.changeDue,
          isPayLater: !isPaidNow,
          isSavedOffline,
        }),
        canOpenOrder: !isSavedOffline,
      });
      reset();
      // navigate, not replace: replacing into a sibling tab renames the tab
      // navigator's state key and remounts it mid-transition, which crashes with
      // "Cannot read property 'stale' of undefined". See lib/tab-navigation.ts.
      goTo(router, "/(main)/pos");

      void settleSaleInBackground(async () => {
        if (outcome.kind === "written") {
          // Convex takes no payment status on create, so a paid sale is marked
          // paid here. A failure must not lose the sale — it already exists.
          if (isPaidNow) {
            try {
              await updatePaymentStatus({ orderId, paymentStatus: "paid" });
            } catch (err) {
              console.warn("[pos] Could not mark the sale paid:", err);
            }
          }
          // Stock, Loyverse, voucher burns, the activity line, customer
          // capture — through the one runner the outbox replay also uses. A
          // queued sale owes it later, once the server holds the order.
          await runPosSaleBookkeeping({ tenantId, orderId, backend, createdAt, bookkeeping });
        }

        // The print queue serialises against the kitchen chit, and a dead
        // printer only logs — the sale is already saved. Built from the
        // arguments the sale was written with, so the paper carries every
        // figure the order does. See `lib/pos-receipt.ts`.
        await receiptPrinted;
      });
    } catch (err) {
      // A store several bundles behind rejects `source: "pos"` outright — its
      // validator predates counter sales. That is a deployment to update, not
      // a sale to retry, and the raw validator dump means nothing at a till.
      Alert.alert("Could not complete the sale", staleBackendMessage(err));
      setIsCompleting(false);
    }
  }, [
    serviceChargeArg,
    method,
    isPayLater,
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
    saleOutlet,
    // Which backend wrote the order, which decides how it is saved and how
    // its guest is captured.
    convexUrl,
    orderBackend,
    createOrder,
    updatePaymentStatus,
    shouldPrint,
    printOrder,
    showLastSale,
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

  const editIntent = isAlreadySettled ? "settled" : isRefund ? "refund" : edit ? "collect" : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        {!edit && isLoyaltyPosEnabled() && hasPermission({ role, isOwner, permissions }, "loyalty_redeem") ? <TouchableOpacity disabled={isCompleting} onPress={() => router.push("/(main)/pos-loyalty")}><Text style={styles.eyebrow}>Redeem a loyalty reward</Text></TouchableOpacity> : null}
        <Text style={styles.eyebrow}>
          {isAlreadySettled
            ? "Nothing to settle"
            : isRefund
              ? "Refund due"
              : "Amount due"}
        </Text>
        <Text style={styles.total}>{formatPeso(amountDue)}</Text>

        {/*
          The discounts inside that figure, named, so the cashier can see the
          voucher from the cart made it to the payment — not a total that is
          merely lower with nothing saying why.
        */}
        {!edit && shownDiscountLines.length > 0 && (
          <View style={styles.discounts} accessibilityLabel="Discounts applied">
            {shownDiscountLines.map((line) => (
              <View key={line.code ?? line.label} style={styles.discountRow}>
                <Text style={styles.discountLabel} numberOfLines={1}>
                  {line.code && line.code !== line.label ? `${line.label} (${line.code})` : line.label}
                </Text>
                <Text style={styles.discountAmount}>−{formatPeso(line.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {edit && editContext && (
          <Text style={styles.editMeta}>
            This order was {formatPeso(editContext.originalTotal)} and is now{" "}
            {formatPeso(edit.newTotal)}.
          </Text>
        )}

        {/*
          The first decision at the counter: is the money changing hands now?
          "Pay later" sends the order to the kitchen unpaid; it is collected
          from the order screen, where the cash and change are entered.
        */}
        {isPayLaterOffered && (
          <View style={styles.modeBlock}>
            <SegmentedControl
              options={TENDER_MODE_OPTIONS}
              value={mode}
              onChange={setMode}
              accessibilityPrefix="Customer pays"
            />
          </View>
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
              placeholder={
                isPayLater
                  ? "Customer name or table (recommended)"
                  : "Customer name (optional)"
              }
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

        {isPayLater && (
          <View style={styles.payLaterCard} accessibilityLabel="Pay later">
            <View style={styles.payLaterHeader}>
              <Icon name="clock" size={20} color={colors.warning} strokeWidth={2} />
              <Text style={styles.payLaterTitle}>
                Unpaid order · {formatPeso(amountDue)}
              </Text>
            </View>
            <Text style={styles.payLaterText}>
              The order goes to the kitchen now and is saved as{" "}
              <Text style={styles.payLaterStrong}>Unpaid</Text>. Nothing is collected yet.
            </Text>
            <Text style={styles.payLaterText}>
              When the customer pays, open the order from{" "}
              <Text style={styles.payLaterStrong}>Orders</Text> and tap{" "}
              <Text style={styles.payLaterStrong}>Collect</Text> to enter the cash received
              and the change.
            </Text>
          </View>
        )}

        {isAlreadySettled || isPayLater ? null : (
        <>
        <Text style={styles.sectionTitle}>
          {isRefund ? "Refund via" : "Payment method"}
        </Text>
        {methods.length === 0 && isLoadingMethods ? (
          <Text style={styles.loadingMethods}>Loading payment methods…</Text>
        ) : methods.length === 0 && methodsError ? (
          // A failed read is not "none enabled": offline with no saved copy,
          // the fix is a connection (pay later still works), not Store Setup.
          <EmptyState
            message={
              isNetworkFailure(methodsError)
                ? "No internet, and this device has not saved the payment methods yet. Connect once to save them — or take this sale as Pay later."
                : `Could not load payment methods. ${methodsError}`
            }
            actionLabel="Try again"
            onAction={() => void refetchMethods()}
          />
        ) : methods.length === 0 ? (
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
              placeholder={
                needsProof && !isRefund
                  ? "Reference number"
                  : "Reference number (optional)"
              }
              placeholderTextColor={colors.textTertiary}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
            />
          </View>
        )}

        {/*
          Proof is the customer's confirmation that they paid. A refund moves
          money the other way, so there is nothing for them to screenshot. The
          camera stays offered once a reference is typed — a cashier who wants
          the photo anyway should not have to clear the field to get it.
        */}
        {method && needsProof && !isRefund && (
          <ProofCapture
            proof={proof}
            onCaptured={setProof}
            onError={(message) => Alert.alert("Capture failed", message)}
            hint={
              reference.trim()
                ? "Not needed — the reference number is enough"
                : "Or type the reference number above"
            }
          />
        )}
        </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isCompleting ? (
          <LoadingState surface="card" message="Completing sale..." />
        ) : (
          <SwipeToComplete
            label={tenderSwipeLabel({ mode: isPayLater ? "later" : "now", edit: editIntent, amountDue })}
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
  discounts: { gap: spacing.xs, marginTop: spacing.xs },
  discountRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  discountLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  discountAmount: { ...typography.caption, color: colors.success, fontWeight: "700" },
  total: { fontSize: 40, fontWeight: "800", color: colors.textPrimary },
  modeBlock: { marginTop: spacing.md },
  payLaterCard: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  payLaterHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  payLaterTitle: { ...typography.heading, color: colors.textPrimary },
  payLaterText: { ...typography.body, color: colors.textPrimary },
  payLaterStrong: { fontWeight: "800" },
  loadingMethods: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
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
