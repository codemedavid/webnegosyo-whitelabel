import React, { useState } from "react";
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { BackHeader } from "../../../components/BackHeader";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { Icon } from "../../../components/Icon";
import { LoadingState } from "../../../components/LoadingState";
import { Modal } from "../../../components/Modal";
import { CategoryBadge } from "../../../components/expenses/CategoryBadge";
import { FixExpenseSheet, VoidExpenseSheet } from "../../../components/expenses/ExpenseActionSheets";
import { readActorName } from "../../../lib/expenses/actor-name";
import { liveExpenseDb } from "../../../lib/expenses/expense-client";
import { PAID_FROM_LABELS, dayLabel, formatCents, spokenCents } from "../../../lib/expenses/expense-format";
import { expenseHistory } from "../../../lib/expenses/expense-history";
import { replaceExpense, voidExpense, type ExpensePatch } from "../../../lib/expenses/expense-service";
import { fetchReceiptLink, flushExpenses, queueReceipt } from "../../../lib/expenses/live-expense-queue";
import { captureReceipt, describeCaptureOutcome } from "../../../lib/expenses/receipt-files";
import {
  useCanManageExpenses,
  useDeviceExpenseQueue,
  useExpenseCategories,
  useExpenseDetail,
  useExpenseTenant,
  useInvalidateExpenses,
} from "../../../lib/expenses/use-expenses";
import { colors, radius, spacing, typography } from "../../../theme/colors";

type Sheet = "fix" | "void" | null;

function refuseInDemo(): boolean {
  if (!useAuthStore.getState().isDemo) return false;
  Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
  return true;
}

/**
 * One expense (plan §5.2): the amount, what it was for, its receipt, and its
 * history. Fix is void + a corrected copy; Void needs a reason; a drawer
 * expense voided while its shift is open puts the cash back in the drawer.
 */
export default function ExpenseDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const tenantId = useExpenseTenant();
  const reload = useInvalidateExpenses();
  const canManage = useCanManageExpenses();
  const detailRead = useExpenseDetail(typeof expenseId === "string" ? expenseId : null);
  const { categories } = useExpenseCategories();
  const queue = useDeviceExpenseQueue();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewing, setViewing] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [openingReceipt, setOpeningReceipt] = useState<string | null>(null);

  const detail = detailRead.data ?? null;

  if (detailRead.isLoading) return <LoadingState />;
  if (!detail) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Expense" />
        <EmptyState
          icon={detailRead.error ? "warning" : "receipt"}
          title={detailRead.error ? "Could not load this expense" : "This expense isn't available"}
          message={detailRead.error ?? "It may belong to another branch, or it was removed from your view."}
          actionLabel={detailRead.error ? "Try again" : undefined}
          onAction={detailRead.error ? () => void detailRead.refetch() : undefined}
          inset
        />
      </View>
    );
  }

  const { expense, receipts, drawer } = detail;
  const category = categories.find((c) => c.id === expense.categoryId);
  const isVoid = expense.status === "void";
  const isDrawer = expense.paidFrom === "drawer";
  const canVoid = canManage && !isVoid && (!isDrawer || drawer?.isShiftOpen === true);
  const requestKey = expense.clientRequestId ?? expense.id;
  const waitingReceipts = queue.receipts.filter((receipt) => receipt.clientRequestId === requestKey).length;

  const openReceipt = async (receiptId: string, mime: string) => {
    setOpeningReceipt(receiptId);
    const link = await fetchReceiptLink(receiptId);
    setOpeningReceipt(null);
    if (link.status === "error") {
      Alert.alert("Receipt", link.message);
      return;
    }
    if (mime === "application/pdf") {
      void Linking.openURL(link.url);
      return;
    }
    setViewing({ url: link.url, isPdf: false });
  };

  const addReceipt = () => {
    if (refuseInDemo() || !tenantId) return;
    const take = async (source: "camera" | "library") => {
      const outcome = await captureReceipt(source).catch(() => null);
      if (!outcome) {
        Alert.alert("Receipt", "The photo could not be saved. Try again.");
        return;
      }
      if (outcome.status !== "captured") {
        const message = describeCaptureOutcome(outcome);
        if (message) Alert.alert("Receipt", message);
        return;
      }
      await queueReceipt({ tenantId, clientRequestId: requestKey, expenseId: expense.id, ...outcome.receipt });
      await flushExpenses(tenantId);
      await reload();
    };
    Alert.alert("Add a receipt", undefined, [
      { text: "Take a photo", onPress: () => void take("camera") },
      { text: "Choose from gallery", onPress: () => void take("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const confirmVoid = async (reason: string) => {
    if (refuseInDemo()) return;
    await voidExpense(liveExpenseDb, expense.id, reason, await readActorName());
    setSheet(null);
    await reload();
  };

  const confirmFix = async (reason: string, patch: ExpensePatch) => {
    if (refuseInDemo()) return;
    const newId = await replaceExpense(liveExpenseDb, expense, reason, patch);
    setSheet(null);
    await reload();
    // The corrected row is the one to read now (same screen, new id).
    router.setParams({ expenseId: newId });
  };

  const facts: { label: string; value: string }[] = [
    { label: "Date", value: `${dayLabel(expense.spentOn)} · ${expense.spentOn}` },
    {
      label: "Paid from",
      value: isDrawer ? `${drawer?.drawerName ?? "Cash"} drawer${drawer && !drawer.isShiftOpen ? " (shift closed)" : ""}` : PAID_FROM_LABELS[expense.paidFrom],
    },
    ...(expense.paidToName ? [{ label: "Paid to", value: expense.paidToName }] : []),
    ...(expense.note ? [{ label: "Note", value: expense.note }] : []),
    ...(expense.isStockPurchase ? [{ label: "Stock", value: "Went into the stock count" }] : []),
    ...(expense.invoiceNo ? [{ label: "Invoice no.", value: expense.invoiceNo }] : []),
  ];

  return (
    <View style={styles.screen}>
      <BackHeader title={category?.name ?? "Expense"} subtitle={isVoid ? "Voided" : undefined} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <CategoryBadge code={category?.icon ?? "··"} size={44} isMuted={isVoid} />
          <Text
            style={[styles.amount, isVoid && styles.struck]}
            accessibilityLabel={`${isVoid ? "Voided, " : ""}${spokenCents(expense.amountCents)}`}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            −{formatCents(expense.amountCents)}
          </Text>
          {isVoid ? (
            <View style={styles.voidPill}>
              <Text style={styles.voidPillText}>Voided{expense.voidReason ? ` · ${expense.voidReason}` : ""}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          {facts.map((fact, index) => (
            <View key={fact.label} style={[styles.fact, index > 0 && styles.factLine]}>
              <Text style={styles.factLabel}>{fact.label}</Text>
              <Text style={styles.factValue}>{fact.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Receipt</Text>
        <View style={styles.card}>
          {receipts.length === 0 && waitingReceipts === 0 ? <Text style={styles.muted}>No receipt yet.</Text> : null}
          {receipts.map((receipt, index) => (
            <TouchableOpacity
              key={receipt.id}
              style={[styles.receipt, index > 0 && styles.factLine]}
              onPress={() => void openReceipt(receipt.id, receipt.mime)}
              disabled={openingReceipt !== null}
              accessibilityRole="button"
              accessibilityLabel={`Open receipt ${index + 1}`}
            >
              <Icon name={receipt.mime === "application/pdf" ? "receipt" : "photo"} size={18} color={colors.textPrimary} />
              <Text style={styles.factValue}>{openingReceipt === receipt.id ? "Opening…" : `Receipt ${index + 1}`}</Text>
              <Icon name="chevron" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
          {waitingReceipts > 0 ? (
            <View style={styles.receipt}>
              <Icon name="rotate" size={18} color={colors.textMuted} />
              <Text style={styles.muted}>{waitingReceipts === 1 ? "1 photo" : `${waitingReceipts} photos`} waiting to upload</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>History</Text>
        <View style={styles.card}>
          {expenseHistory(detail).map((line, index) => (
            <TouchableOpacity
              key={line.key}
              style={[styles.history, index > 0 && styles.factLine]}
              disabled={!line.linkExpenseId}
              onPress={() => line.linkExpenseId && router.push(`/(main)/expense/${line.linkExpenseId}` as never)}
              accessibilityRole={line.linkExpenseId ? "link" : "text"}
            >
              <View style={styles.dot} />
              <View style={styles.historyBody}>
                <Text style={styles.factValue}>{line.text}</Text>
                {line.when ? <Text style={styles.muted}>{line.when}</Text> : null}
              </View>
              {line.linkExpenseId ? <Icon name="chevron" size={16} color={colors.textSecondary} /> : null}
            </TouchableOpacity>
          ))}
        </View>

        {canManage && !isVoid ? (
          <View style={styles.actions}>
            <Button label="Add receipt" icon="photo" tone="secondary" onPress={addReceipt} fullWidth />
            <Button label="Fix" icon="edit" tone="secondary" onPress={() => !refuseInDemo() && setSheet("fix")} fullWidth />
            {canVoid ? (
              <>
                {isDrawer ? (
                  <Text style={styles.muted}>Voiding puts {formatCents(expense.amountCents, { compact: true })} back in the drawer.</Text>
                ) : null}
                <Button label="Void" icon="trash" tone="ghost" onPress={() => !refuseInDemo() && setSheet("void")} fullWidth />
              </>
            ) : isDrawer ? (
              <Text style={styles.muted}>This shift is closed, so the cash can't go back into the drawer. Use Fix to change the category instead.</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {sheet === "void" ? (
        <VoidExpenseSheet
          expense={expense}
          drawerNote={isDrawer ? `Voiding puts ${formatCents(expense.amountCents, { compact: true })} back in the drawer.` : null}
          onConfirm={confirmVoid}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "fix" ? (
        <FixExpenseSheet expense={expense} categories={categories} onConfirm={confirmFix} onClose={() => setSheet(null)} />
      ) : null}
      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing ? <Image source={{ uri: viewing.url }} style={styles.viewerImage} resizeMode="contain" accessibilityLabel="Receipt photo" /> : null}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewing(null)} accessibilityRole="button" accessibilityLabel="Close receipt">
            <Icon name="close" size={24} color={colors.textOnDark} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  amount: { fontSize: 40, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  struck: { textDecorationLine: "line-through", color: colors.textMuted },
  voidPill: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  voidPillText: { ...typography.caption, fontWeight: "700", color: colors.textMuted },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: spacing.lg },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
  factLine: { borderTopWidth: 1, borderTopColor: colors.separator },
  factLabel: { ...typography.caption, color: colors.textMuted },
  factValue: { ...typography.body, color: colors.textPrimary, flexShrink: 1, textAlign: "left" },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm },
  muted: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.sm },
  receipt: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52 },
  history: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  historyBody: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.textTertiary },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" },
  viewerImage: { width: "100%", height: "85%" },
  viewerClose: { position: "absolute", top: 48, right: spacing.lg, width: 48, height: 48, alignItems: "center", justifyContent: "center" },
});
