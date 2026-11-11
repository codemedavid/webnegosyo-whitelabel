import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { IconButton } from "../../components/IconButton";
import { LoadingState } from "../../components/LoadingState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { AddExpenseSheet } from "../../components/expenses/AddExpenseSheet";
import { BillEditorSheet, type BillEditorMode } from "../../components/expenses/bills/BillEditorSheet";
import { BillGroups } from "../../components/expenses/bills/BillGroups";
import { BillNotice } from "../../components/expenses/bills/BillNotice";
import { BillSheet, type BillDone } from "../../components/expenses/bills/BillSheet";
import { BillsEmpty } from "../../components/expenses/bills/BillsEmpty";
import { useBillWrites } from "../../components/expenses/bills/use-bill-writes";
import { QuietBanner } from "../../components/expenses/home/HomeBits";
import { ensureBillReminderPermission } from "../../lib/expenses/bill-alerts-device";
import { offeredPresets, presetCategory } from "../../lib/expenses/bill-editor-form";
import type { BillPreset } from "../../lib/expenses/bill-schedule";
import {
  CLEARED_BILL_PARAMS,
  NO_PREFILL,
  hasBillsParams,
  parseBillsParams,
  type BillsRouteParams,
} from "../../lib/expenses/bills-route";
import { buildBillsView, findBillRow, leftToPayText, type BillPayContext, type BillRowModel } from "../../lib/expenses/bills-screen";
import { BILL_HISTORY_DAYS } from "../../lib/expenses/bills-service";
import { canChooseBranch } from "../../lib/branch-context";
import { addDays } from "../../lib/expenses/manila-date";
import { useBillBoard } from "../../lib/expenses/use-bills";
import { useCanManageExpenses, useCategoryIndex, useExpenseCategories, useExpenseOutlet } from "../../lib/expenses/use-expenses";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { useAccountBranchScope } from "../../lib/use-branch-scope";
import { useOutlets } from "../../lib/use-outlets";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { colors, spacing } from "../../theme/colors";

type Sheet =
  | { kind: "bill"; billId: string; dueOn: string | null }
  | { kind: "editor"; mode: BillEditorMode }
  | { kind: "pay"; context: BillPayContext }
  | null;

interface Notice extends BillDone {
  id: number;
}

/**
 * Bills to pay (bills-contract §5): rent, kuryente, sahod and the rest, by
 * when they need the owner — Late, This week, Later — with Paused and Paid this
 * month folded. A bill is a reminder; "Mark paid" records one ordinary expense
 * through the add sheet. Reached from Expenses (hero line, card, door) and by
 * links (`?new=1…`, `?bill=<id>`), so it checks the `expenses` key itself.
 */
export default function ExpenseBillsScreen() {
  const canManage = useCanManageExpenses();
  return canManage ? <BillsBoard /> : <LockedBills />;
}

function LockedBills() {
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Bills to pay" />
      <View style={styles.inset}>
        <EmptyState icon="lock" title="Bills are locked" message="Ask the owner to turn on Expenses for your account." inset />
      </View>
    </View>
  );
}

function BillsBoard() {
  const params = useLocalSearchParams<Record<keyof BillsRouteParams, string>>();
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);
  const board = useBillBoard(selectedOutlet ?? undefined);
  const { categories } = useExpenseCategories();
  const categoryIndex = useCategoryIndex(categories);
  const { outlets } = useOutlets();
  const accountScope = useAccountBranchScope();
  const defaultOutletId = useExpenseOutlet();
  const writes = useBillWrites();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingBillId, setPendingBillId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { today } = board;
  const isLoaded = board.data !== undefined;
  const view = useMemo(
    () => buildBillsView({ bills: board.board.bills, payments: board.board.payments, marks: board.board.marks, today }),
    [board.board, today],
  );
  const presets = useMemo(() => offeredPresets(categories), [categories]);
  const branches = canChooseBranch(accountScope) && outlets.length > 1 ? outlets.map((outlet) => ({ id: outlet.id, name: outlet.name })) : [];

  const say = useCallback((done: BillDone) => setNotice({ ...done, id: Date.now() }), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  // Links land here asking for the add sheet (pre-filled) or one bill's sheet.
  const { new: isNew, bill, category, amount, day, name } = params;
  useEffect(() => {
    const raw = { new: isNew, bill, category, amount, day, name };
    if (!hasBillsParams(raw)) return;
    const intent = parseBillsParams(raw);
    if (intent?.kind === "new") setSheet({ kind: "editor", mode: { kind: "new", prefill: intent.prefill } });
    if (intent?.kind === "bill") setPendingBillId(intent.billId);
    router.setParams(CLEARED_BILL_PARAMS);
  }, [isNew, bill, category, amount, day, name]);

  // A linked bill opens once the board has come back.
  useEffect(() => {
    if (pendingBillId === null || !isLoaded) return;
    setPendingBillId(null);
    if (findBillRow(view, pendingBillId)) setSheet({ kind: "bill", billId: pendingBillId, dueOn: null });
    else say({ message: "That bill isn't on your list anymore. It may have been stopped." });
  }, [pendingBillId, isLoaded, view, say]);

  const refresh = useCallback(() => refreshWithMinSpinner([board.refetch], setIsRefreshing), [board.refetch]);

  const openRow = (row: BillRowModel) => setSheet({ kind: "bill", billId: row.bill.id, dueOn: row.occurrence.dueOn });
  const addBill = () => setSheet({ kind: "editor", mode: { kind: "new", prefill: NO_PREFILL } });
  const startFromPreset = (preset: BillPreset) =>
    setSheet({
      kind: "editor",
      mode: { kind: "new", prefill: { ...NO_PREFILL, categoryId: presetCategory(preset, categories)?.id ?? null, name: preset.name } },
    });

  const sheetRow = sheet?.kind === "bill" ? findBillRow(view, sheet.billId, sheet.dueOn) : null;
  const subtitle = isLoaded ? leftToPayText(view.still, today) : undefined;
  const header = (
    <ScreenHeader
      title="Bills to pay"
      subtitle={subtitle}
      actions={<IconButton icon="plus" label="Add a bill" onPress={addBill} />}
    />
  );

  const undoSkip = (undo: NonNullable<BillDone["undo"]>) => {
    setNotice(null);
    void writes.unmark(undo.billId, undo.dueOn).then((result) => {
      if (!result.ok && result.message) say({ message: result.message });
    });
  };

  const undoable = notice?.undo ?? null;
  let body: React.ReactNode;
  if (!isLoaded && board.error) {
    body = <ErrorState title="Bills could not load" message={board.error} onRetry={() => void board.refetch()} />;
  } else if (!isLoaded) {
    body = <LoadingState message="Opening your bills..." />;
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {board.error ? <QuietBanner message="Could not refresh. Showing what was loaded before." onRetry={() => void board.refetch()} /> : null}
        {view.groups.length === 0 ? (
          <BillsEmpty presets={presets} canAdd onPreset={startFromPreset} onAdd={addBill} />
        ) : (
          <>
            <BillGroups groups={view.groups} categories={categoryIndex} onOpen={openRow} />
            <Button label="Add a bill" icon="plus" size="lg" tone="secondary" onPress={addBill} testID="bills-add" />
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      {body}

      {sheet?.kind === "bill" && sheetRow ? (
        <BillSheet
          row={sheetRow}
          category={categoryIndex.get(sheetRow.bill.categoryId) ?? null}
          categories={categoryIndex}
          payments={board.board.payments}
          outlets={outlets}
          today={today}
          historyFrom={addDays(today, -BILL_HISTORY_DAYS)}
          writes={writes}
          onPay={(context) => setSheet({ kind: "pay", context })}
          onEdit={() => setSheet({ kind: "editor", mode: { kind: "edit", bill: sheetRow.bill } })}
          onOpenExpense={(expenseId) => {
            setSheet(null);
            router.push(`/(main)/expense/${expenseId}` as never);
          }}
          onDone={(done) => {
            setSheet(null);
            say(done);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "editor" ? (
        <BillEditorSheet
          mode={sheet.mode}
          categories={categories}
          branches={branches}
          defaultOutletId={defaultOutletId}
          payments={board.board.payments}
          today={today}
          writes={writes}
          onSaved={(saved, isNew) => {
            const isFirstBill = isNew && board.board.bills.length === 0;
            setSheet(null);
            // The first bill is when reminders start to matter: ask once (never again if already asked).
            if (isFirstBill) {
              ensureBillReminderPermission().catch((error: unknown) => console.warn("[bills] reminder permission", error));
            }
            say({ message: isNew ? `${saved.name} added to Bills to pay` : `${saved.name} saved. Changes apply from the next due date.` });
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "pay" ? (
        <AddExpenseSheet visible mode={{ kind: "book" }} bill={sheet.context} onClose={() => setSheet(null)} />
      ) : null}
      {notice ? (
        <BillNotice
          key={notice.id}
          message={notice.message}
          onUndo={undoable ? () => undoSkip(undoable) : undefined}
          onDismiss={dismissNotice}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inset: { paddingHorizontal: spacing.xl },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 120, gap: spacing.lg },
});
