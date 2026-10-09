import React, { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { FunctionReference } from "convex/server";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { useSafeQuery } from "../../lib/hooks";
import { filterOrdersToScope } from "../../lib/branch-scope";
import { useBranchScope } from "../../lib/use-branch-scope";
import { formatPeso } from "../../lib/format";
import { isCashMethod } from "../../lib/pos-payment-methods";
import { useTenderPaymentMethods } from "../../lib/query/use-tender-payment-methods";
import { useOfflineOrderMutation } from "../../lib/offline/use-offline-orders";
import type { OrderDto } from "../../lib/backends/supabase-orders";
import type { ReceiptOrder } from "../../lib/receipt-layout";
import { useAuthStore } from "../../stores/auth-store";
import { useBillPlan, useBillStore } from "../../stores/bill-store";
import { useOrderPrint, type PrintFeedback } from "../../hooks/useOrderPrint";
import { toCents } from "../../lib/bill/money";
import { billSummary } from "../../lib/bill/bill-orders";
import { assignUnit, billKey, isPlanLocked, setGuests, setMode, type SplitMode } from "../../lib/bill/bill-plan";
import { billPartViews, itemSplitBlockedReason, type BillPartView } from "../../lib/bill/bill-parts";
import { billTitle, wholeBillReceipt } from "../../lib/bill/bill-receipt";
import { billCandidates } from "../../lib/bill/bill-candidates";
import { billCollectGate, parseBillOrderIds, resolveBill } from "../../lib/bill/bill-state";
import { useBillCollect } from "../../lib/bill/use-bill-collect";
import { getOrderTableNumber } from "../../lib/order-table-number";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { OptionPills } from "../../components/OptionPills";
import { SectionHeader } from "../../components/SectionHeader";
import { CollectPaymentSheet } from "../../components/order/CollectPaymentSheet";
import { BillOrderReader, type BillOrderRead } from "../../components/bill/BillOrderReader";
import { BillTotalsCard } from "../../components/bill/BillTotalsCard";
import { BillOrdersCard } from "../../components/bill/BillOrdersCard";
import { AddOrderSheet } from "../../components/bill/AddOrderSheet";
import { GuestCountStepper } from "../../components/bill/GuestCountStepper";
import { GuestPartCard } from "../../components/bill/GuestPartCard";
import { TablePool } from "../../components/bill/TablePool";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const recordPaymentRef = "orders:recordPayment" as unknown as FunctionReference<"mutation">;
const updatePaymentStatusRef = "orders:updatePaymentStatus" as unknown as FunctionReference<"mutation">;
const ORDERS_FETCH_LIMIT = 200;

const MODE_OPTIONS: readonly { label: string; value: SplitMode }[] = [
  { label: "One bill", value: "one" },
  { label: "Split evenly", value: "even" },
  { label: "By item", value: "items" },
];

/**
 * One bill over one or more orders: combine orders, split it evenly or by who
 * had what, and print or collect each share. Reached from a table ("Bill &
 * split") and from an order. See `lib/bill/` — nothing here moves an item
 * between orders.
 */
export default function BillRoute() {
  const { orders } = useLocalSearchParams<{ orders?: string | string[] }>();
  const orderIds = useMemo(() => parseBillOrderIds(orders), [orders]);
  if (orderIds.length === 0) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Bill" />
        <ErrorState title="No orders on this bill" message="Open a bill from a table or an order." onRetry={() => router.back()} />
      </View>
    );
  }
  // Tab screens never unmount; keyed so a different bill starts clean.
  return <BillScreen key={billKey(orderIds)} orderIds={orderIds} />;
}

function printLabel(feedback: PrintFeedback | null, key: string, idle: string): string {
  if (feedback?.orderId !== key) return idle;
  if (feedback.status === "printing") return "Printing…";
  return feedback.status === "printed" ? "Printed" : "Print again";
}

function BillScreen({ orderIds }: { orderIds: string[] }) {
  const key = billKey(orderIds);
  const [reads, setReads] = useState<Record<string, BillOrderRead>>({});
  const onRead = useCallback((id: string, read: BillOrderRead) => setReads((prev) => ({ ...prev, [id]: read })), []);
  const plan = useBillPlan(key);
  const updatePlan = useBillStore((s) => s.update);
  const resetPlan = useBillStore((s) => s.reset);
  const [activeGuest, setActiveGuest] = useState(0);
  const [isAdding, setAdding] = useState(false);

  const { printOrder, shouldPrint, hasPrinter, feedback } = useOrderPrint();
  const scope = useBranchScope();
  const { isOwner, permissions, role, orderBackend, isDemo, userId } = useAuthStore();
  const recordPayment = useOfflineOrderMutation(recordPaymentRef);
  const updatePaymentStatus = useOfflineOrderMutation(updatePaymentStatusRef);
  const { methods: storeMethods } = useTenderPaymentMethods(
    useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId),
    null,
    true,
  );
  const { data: recentOrders } = useSafeQuery<OrderDto[]>(getOrdersRef, { limit: ORDERS_FETCH_LIMIT });

  const state = useMemo(() => resolveBill(orderIds, reads), [orderIds, reads]);
  const orders = useMemo(() => (state.status === "ready" ? state.orders : []), [state]);
  const summary = billSummary(orders);
  const title = billTitle(orders);
  const isLocked = isPlanLocked(plan);
  // The bill's date on paper: when it was opened, so the parts stay memoized.
  const [nowMs] = useState(() => Date.now());
  const { parts, unassigned } = useMemo(() => billPartViews(orders, plan, nowMs), [orders, plan, nowMs]);
  const guestCount = plan.guests;
  const active = Math.min(activeGuest, guestCount - 1);

  const gate = billCollectGate({
    orders,
    ledgers: Object.fromEntries(orderIds.map((id) => [id, reads[id]?.ledger ?? "unavailable"])),
    backend: orderBackend ?? "convex",
    user: { role, isOwner, permissions },
    scope,
    isDemo,
  });
  const collect = useBillCollect({
    orders,
    billTitle: title,
    billKey: key,
    userId: userId ?? undefined,
    outletId: scope.kind === "branch" ? scope.outletId : undefined,
    recordPayment: (args) => recordPayment(args),
    updatePaymentStatus: (args) => updatePaymentStatus(args),
    updatePlan,
    printBillOut: (receipt, options) => {
      if (shouldPrint("billout")) void printOrder(receipt, options);
    },
  });

  const candidates = useMemo(() => {
    const scoped = (filterOrdersToScope(scope, recentOrders) as OrderDto[] | undefined) ?? [];
    const table = orders.length > 0 ? getOrderTableNumber(orders[0].customerData) : null;
    return billCandidates(scoped, { onBill: orderIds, table });
  }, [scope, recentOrders, orders, orderIds]);

  const setOrderIds = (next: readonly string[]) => router.setParams({ orders: next.join(",") });

  const print = async (receipt: ReceiptOrder, printKey: string) => {
    const isPrinted = await printOrder(receipt, { printKey, withQr: false });
    if (!isPrinted) Alert.alert("Print failed", "Check the receipt printer in Printer settings, then try again.");
  };
  const printPart = (part: BillPartView) => print(part.receipt(part.paidCents), `${key}:${part.key}`);
  const printAll = async () => {
    for (const part of parts.filter((p) => p.amountCents > 0)) await printPart(part);
  };

  const chooseMode = (mode: SplitMode) => {
    if (mode === plan.mode) return;
    if (isLocked) {
      Alert.alert("A guest has already paid", "Start over to split what is left a different way.", [
        { text: "Keep this split", style: "cancel" },
        { text: "Start over", onPress: () => resetPlan(key) },
      ]);
      return;
    }
    const blocked = mode === "items" ? itemSplitBlockedReason(orders, plan) : null;
    if (blocked) {
      Alert.alert("Split evenly instead", blocked);
      return;
    }
    updatePlan(key, (current) => setMode(current, mode, toCents(summary.owed)));
  };

  if (state.status !== "ready") {
    return (
      <View style={styles.screen}>
        {orderIds.map((id) => (
          <BillOrderReader key={id} orderId={id} onRead={onRead} />
        ))}
        <BackHeader title="Bill" />
        {state.status === "error" ? (
          <ErrorState title="The bill did not load" message={state.message} onRetry={() => router.back()} />
        ) : (
          <LoadingState message="Adding up the bill" />
        )}
      </View>
    );
  }

  const collectReason = gate.allowed ? undefined : gate.reason;
  const partCard = (part: BillPartView) => (
    <GuestPartCard
      key={part.key}
      part={part}
      isActive={plan.mode === "items" && !isLocked && part.guest === active}
      onActivate={plan.mode === "items" && !isLocked ? () => setActiveGuest(part.guest) : undefined}
      onReturn={plan.mode === "items" && !isLocked ? (unitId) => updatePlan(key, (p) => assignUnit(p, unitId, null)) : undefined}
      printLabel={printLabel(feedback, `${key}:${part.key}`, "Print")}
      onPrint={hasPrinter ? () => void printPart(part) : undefined}
      onCollect={() => collect.open({ kind: "part", part })}
      collectDisabledReason={collectReason}
    />
  );

  return (
    <View style={styles.screen}>
      {orderIds.map((id) => (
        <BillOrderReader key={id} orderId={id} onRead={onRead} />
      ))}
      <BackHeader title={title} subtitle={orders.length === 1 ? "1 order" : `${orders.length} orders combined`} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BillTotalsCard summary={summary} />

        <SectionHeader title="On this bill" />
        <BillOrdersCard
          orders={orders}
          isLocked={isLocked}
          onAdd={() => setAdding(true)}
          onRemove={(id) => setOrderIds(orderIds.filter((other) => other !== id))}
          onOpen={(id) => router.push(`/(main)/order/${id}`)}
        />

        <SectionHeader title="How are they paying?" />
        <OptionPills<SplitMode>
          options={MODE_OPTIONS}
          isSelected={(mode) => mode === plan.mode}
          onSelect={chooseMode}
          accessibilityPrefix="Pay as"
        />

        {plan.mode === "one" ? (
          <View style={styles.oneBill}>
            {summary.owed > 0 ? (
              <Button
                label={`Collect ${formatPeso(summary.owed)}`}
                size="lg"
                onPress={() => collect.open({ kind: "bill" })}
                disabled={!gate.allowed}
                accessibilityHint={collectReason}
              />
            ) : null}
            {hasPrinter ? (
              <Button
                label={printLabel(feedback, `${key}:bill`, orders.length > 1 ? "Print combined bill" : "Print bill")}
                icon="printer"
                tone="secondary"
                size="lg"
                onPress={() => void print(wholeBillReceipt(orders, { nowMs: Date.now() }), `${key}:bill`)}
              />
            ) : null}
            {!gate.allowed && summary.owed > 0 ? <Text style={styles.hint}>{collectReason}</Text> : null}
          </View>
        ) : (
          <View style={styles.split}>
            <GuestCountStepper
              value={guestCount}
              disabled={isLocked}
              onChange={(next) => updatePlan(key, (p) => setGuests(p, next))}
            />
            {isLocked ? (
              <View style={styles.locked}>
                <Text style={styles.lockedText}>A guest has paid, so this split is fixed.</Text>
                <Button label="Start over" tone="ghost" size="sm" onPress={() => resetPlan(key)} />
              </View>
            ) : null}
            {!gate.allowed && summary.owed > 0 ? <Text style={styles.hint}>{collectReason}</Text> : null}
            {plan.mode === "items" && !isLocked ? (
              <TablePool
                units={unassigned}
                activeLabel={`Guest ${active + 1}`}
                onGive={(unitId) => updatePlan(key, (p) => assignUnit(p, unitId, active))}
              />
            ) : null}
            {parts.map(partCard)}
            {hasPrinter && parts.some((p) => p.amountCents > 0) ? (
              <Button label="Print every guest's slip" icon="printer" tone="ghost" onPress={() => void printAll()} />
            ) : null}
          </View>
        )}
      </ScrollView>

      <AddOrderSheet
        visible={isAdding}
        candidates={candidates}
        onClose={() => setAdding(false)}
        onPick={(id) => {
          setAdding(false);
          setOrderIds([...orderIds, id]);
        }}
      />
      <CollectPaymentSheet
        visible={collect.target !== null}
        balanceDue={collect.balanceDue}
        methods={storeMethods.map((method) => ({ id: method.id, name: method.name, isCash: isCashMethod(method) }))}
        onSubmit={collect.submit}
        onClose={collect.close}
        title={collect.title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  oneBill: { gap: spacing.sm },
  split: { gap: spacing.md },
  hint: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
  },
  lockedText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600", flex: 1 },
});
