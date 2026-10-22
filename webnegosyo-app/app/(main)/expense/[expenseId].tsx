import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { BackHeader } from "../../../components/BackHeader";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { SectionHeader } from "../../../components/SectionHeader";
import { ChangeExpenseSheet, VoidExpenseSheet } from "../../../components/expenses/ExpenseActionSheets";
import { ReceiptViewer } from "../../../components/expenses/ReceiptViewer";
import { PaidForCard, RepeatThis } from "../../../components/expenses/bills/BillDetailLink";
import { useBillWrites } from "../../../components/expenses/bills/use-bill-writes";
import { ActionBar } from "../../../components/expenses/detail/ActionBar";
import { DetailHero } from "../../../components/expenses/detail/DetailHero";
import { FactsCard } from "../../../components/expenses/detail/FactsCard";
import { FlagCallouts } from "../../../components/expenses/detail/FlagCallouts";
import { HistoryTimeline } from "../../../components/expenses/detail/HistoryTimeline";
import { ReceiptStrip } from "../../../components/expenses/detail/ReceiptStrip";
import { RefusedReceipts } from "../../../components/expenses/detail/RefusedReceipts";
import { refuseInDemo, useExpenseDetailWrites } from "../../../components/expenses/detail/use-expense-detail-writes";
import { detailBillLink } from "../../../lib/expenses/bills-screen";
import { categoryLook } from "../../../lib/expenses/category-look";
import {
  detailAccess,
  detailActions,
  factRows,
  flagCallouts,
  receiptTiles,
  statusPill,
  timelineEntries,
  viewerItems,
  type FlagAction,
} from "../../../lib/expenses/expense-detail";
import { useReceiptLinks } from "../../../lib/expenses/expense-detail-receipts";
import { dismissReceipt, retryReceipt } from "../../../lib/expenses/live-expense-queue";
import { monthOf } from "../../../lib/expenses/expense-format";
import type { ExpenseReceiptRef } from "../../../lib/expenses/expense-service";
import type { Expense } from "../../../lib/expenses/types";
import {
  useCanManageExpenses,
  useDeviceExpenseQueue,
  useExpenseCategories,
  useExpenseDetail,
  useExpenseMonth,
  useExpenseTenant,
  useInvalidateExpenses,
  useRecentExpenses,
} from "../../../lib/expenses/use-expenses";
import { useBillBoard } from "../../../lib/expenses/use-bills";
import { useOutlets } from "../../../lib/use-outlets";
import { useBranchContextStore } from "../../../stores/branch-context-store";
import { colors, spacing, typography } from "../../../theme/colors";

type Sheet = "change" | "void" | null;

const NO_RECEIPTS: ExpenseReceiptRef[] = [];
const NO_EXPENSES: Expense[] = [];

function openExpense(expenseId: string) {
  router.push(`/(main)/expense/${expenseId}` as never);
}

/**
 * One expense (design brief §4): the amount and its status in words, any
 * flag explained with its fix, the facts, receipt thumbnails that open full
 * screen, and the history. Change = void + a corrected copy; Void needs a
 * reason; a drawer expense voided while its shift is open puts the cash back.
 *
 * Reached by links too (Activity's "Open expense", the assistant), so it
 * checks access itself: the `expenses` key opens everything; a cashier may
 * read a drawer expense they paid (the database returns only those), with no
 * owner actions; anything else is locked.
 */
export default function ExpenseDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const tenantId = useExpenseTenant();
  const reload = useInvalidateExpenses();
  const canManage = useCanManageExpenses();
  const detailRead = useExpenseDetail(typeof expenseId === "string" ? expenseId : null);
  const { categories } = useExpenseCategories();
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);
  const queue = useDeviceExpenseQueue();
  const { outlets } = useOutlets();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewingKey, setViewingKey] = useState<string | null>(null);

  const detail = detailRead.data ?? null;
  const expense = detail?.expense ?? null;
  // Duplicates are judged against the SAME rows the Expenses list flags from
  // (this expense's month, same branch, same cache), so both always agree.
  const month = useExpenseMonth(expense ? monthOf(expense.spentOn) : "", selectedOutlet ?? undefined, expense !== null);
  const { expenses: recent } = useRecentExpenses(sheet === "change");
  const signing = useReceiptLinks(tenantId, detail?.receipts ?? NO_RECEIPTS);
  const writes = useExpenseDetailWrites({ tenantId, expense, reload, onWritten: () => setSheet(null) });
  // Bills name the bill this paid ("Paid for: Rent · October"), and hide "Repeat this" once one exists.
  const billBoard = useBillBoard(undefined, canManage && expense !== null);
  const billWrites = useBillWrites();

  const requestKey = expense ? expense.clientRequestId ?? expense.id : null;
  const tiles = useMemo(() => {
    const waiting = queue.receipts.filter((receipt) => receipt.clientRequestId === requestKey);
    return receiptTiles(detail?.receipts ?? NO_RECEIPTS, signing.links, waiting);
  }, [detail?.receipts, signing.links, queue.receipts, requestKey]);
  const photos = useMemo(() => viewerItems(tiles), [tiles]);

  if (detailRead.isLoading) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Expense" />
        <LoadingState message="Opening the expense..." />
      </View>
    );
  }
  const access = detailAccess({ canManage, expense });
  if (access === "locked" && !(detailRead.error && !detail)) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Expense" />
        <EmptyState
          icon="lock"
          title="Expenses are locked"
          message="You can open the drawer expenses you paid. Ask the owner for Expenses access to see the rest."
          inset
        />
      </View>
    );
  }
  if (!detail || !expense) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Expense" />
        {detailRead.error ? (
          <ErrorState title="Couldn't open this expense" message={detailRead.error} onRetry={() => void detailRead.refetch()} />
        ) : (
          <EmptyState
            icon="receipt"
            title="This expense isn't available"
            message="It may belong to another branch, or it was removed from your view."
            inset
          />
        )}
      </View>
    );
  }

  const category = categories.find((candidate) => candidate.id === expense.categoryId);
  const isVoid = expense.status === "void";
  const actions = detailActions({ canManage, expense, drawer: detail.drawer });
  const branchName =
    outlets.length === 0 ? null : expense.outletId ? outlets.find((o) => o.id === expense.outletId)?.name ?? "Another branch" : "Whole store";
  const callouts = flagCallouts({
    expense,
    categories,
    others: month.data?.expenses ?? NO_EXPENSES,
    canManage: actions.canAddReceipt,
  });
  const status = statusPill({
    expense,
    isChange: detail.replaces !== null,
    isReplaced: detail.replacedBy !== null,
    isWaitingOnPhone: queue.expenses.some((queued) => queued.id === requestKey),
  });
  const heroTitle = [expense.note, category?.name].filter(Boolean).join(" · ") || "Expense";
  const viewingIndex = photos.findIndex((photo) => photo.key === viewingKey);

  const onFlag = (action: FlagAction) => (action.kind === "add_receipt" ? writes.addReceipt() : openExpense(action.expenseId));
  const openPhoto = (key: string) => {
    if (photos.some((photo) => photo.key === key)) return setViewingKey(key);
    if (signing.isLoading) return;
    void signing.refetch();
    Alert.alert("Receipt", "This photo could not be opened yet. Try again in a moment.");
  };
  const openSheet = (next: Exclude<Sheet, null>) => !refuseInDemo() && setSheet(next);
  const billLink = detailBillLink({ expense, category: category ?? null, bills: billBoard.board.bills, canManage });
  // "Not for this bill": takes a wrong link off; the expense and its money stay as they are.
  const unlinkBill = () =>
    void billWrites.unlink(expense.id).then((result) => {
      if (!result.ok && result.message) Alert.alert("Not for this bill", result.message);
    });
  const billLinkView =
    billLink?.kind === "paid_for" ? (
      <PaidForCard
        text={billLink.text}
        onPress={() => router.push(billLink.href as never)}
        onUnlink={billLink.canUnlink ? unlinkBill : undefined}
        isUnlinking={billWrites.isBusy}
      />
    ) : billLink?.kind === "repeat" && billBoard.data !== undefined ? (
      <RepeatThis categoryName={billLink.categoryName} onPress={() => router.push(billLink.href as never)} />
    ) : null;

  return (
    <View style={styles.screen}>
      <BackHeader title="Expense" />
      <ScrollView contentContainerStyle={styles.body}>
        {detailRead.error ? (
          <View style={styles.stale}>
            <Text style={styles.staleText}>{"Couldn't refresh. Showing what was saved."}</Text>
            <Button label="Try again" tone="ghost" size="sm" onPress={() => void detailRead.refetch()} />
          </View>
        ) : null}
        <DetailHero look={categoryLook(category)} amountCents={expense.amountCents} title={heroTitle} status={status} isVoid={isVoid} />
        <FlagCallouts callouts={callouts} onAction={onFlag} />
        <FactsCard rows={factRows({ detail, branchName })} />
        {billLinkView}
        {actions.closedShiftNote ? <Text style={styles.note}>{actions.closedShiftNote}</Text> : null}

        <SectionHeader title="Receipts" style={styles.section} />
        <ReceiptStrip
          tiles={tiles}
          isSigning={signing.isLoading}
          openingPdfId={writes.openingPdfId}
          canAdd={actions.canAddReceipt}
          onAdd={writes.addReceipt}
          onOpenPhoto={openPhoto}
          onOpenPdf={(receiptId) => void writes.openPdf(receiptId)}
        />
        <RefusedReceipts
          tiles={tiles}
          onRetry={(receiptId) => {
            if (tenantId) void retryReceipt(tenantId, receiptId);
          }}
          onRemove={(receiptId) => void dismissReceipt(receiptId)}
        />

        <SectionHeader title="History" style={styles.section} />
        <HistoryTimeline entries={timelineEntries(detail)} onOpenExpense={openExpense} />
      </ScrollView>

      <ActionBar
        actions={actions}
        onAddReceipt={writes.addReceipt}
        onChange={() => openSheet("change")}
        onVoid={() => openSheet("void")}
      />

      {sheet === "void" ? (
        <VoidExpenseSheet expense={expense} drawerNote={actions.voidNote} onConfirm={writes.confirmVoid} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "change" ? (
        <ChangeExpenseSheet
          expense={expense}
          categories={categories}
          recent={recent}
          onConfirm={writes.confirmChange}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {viewingIndex >= 0 ? (
        <ReceiptViewer key={viewingKey} items={photos} initialIndex={viewingIndex} visible onClose={() => setViewingKey(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  section: { marginTop: spacing.sm, marginBottom: 0 },
  note: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.xs },
  stale: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  staleText: { ...typography.caption, color: colors.textMuted, flex: 1 },
});
