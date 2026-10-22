import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  applyRepeat,
  asksStockQuestion,
  canTapSave,
  categoriesForScope,
  drawerAfterCents,
  drawerChipLabel,
  formForOpening,
  nextEntryForm,
  NOTE_MAX,
  PAID_TO_MAX,
  primaryLabel,
  selectCategory,
  sheetTitle,
  withNote,
  type AddExpenseForm,
  type AddExpenseMode,
  type ExpenseSheetScope,
} from "../../lib/expenses/add-expense-form";
import { amountChips, payForLine, type BillPayContext } from "../../lib/expenses/bills-screen";
import { rankCategoriesForPicker } from "../../lib/expenses/categories";
import { manilaToday, spokenCents } from "../../lib/expenses/expense-format";
import { formatPeso, keypadCents, keypadDisplay, keypadFromCents, pressKey, type KeypadKey } from "../../lib/expenses/keypad";
import type { CapturedReceipt } from "../../lib/expenses/receipt-files";
import { repeatSuggestions } from "../../lib/expenses/repeat-chips";
import { useExpenseCategories, useRecentExpenses, useTracksStock } from "../../lib/expenses/use-expenses";
import type { ExpenseCategory } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { centeredDialog, useCenteredDialog } from "../pos/dialog-layout";
import { BackRow, Chip, DrawerLine, ExtrasRow, FoldInput, PaidFromRow, RepeatRow, StockQuestion } from "./AddExpenseParts";
import { CategoryGrid, CategoryList } from "./CategoryPicker";
import { ExpenseAmount } from "./ExpenseAmount";
import { ExpenseDatePicker, IS_DATE_PICKER_INLINE } from "./ExpenseDatePicker";
import { ExpenseKeypad, sheetSizing } from "./ExpenseKeypad";
import { expenseExtras } from "./expense-extras";
import { ExpenseUndoBar } from "./ExpenseUndoHost";
import { promptForReceipt } from "./receipt-prompt";
import { useExpenseSave } from "./use-expense-save";

export { UNDO_WINDOW_MS } from "../../stores/expense-undo-store";
export type { ExpenseSheetScope } from "../../lib/expenses/add-expense-form";

/** Scrim left showing above the sheet on a phone, under the status bar. */
const SCRIM_GAP = 8;
const SHEET_RADIUS = 22;
/** A centred dialog on a tablet stops growing here. */
const MAX_DIALOG_HEIGHT = 820;

type Panel = "note" | "paidTo" | "date" | "all" | null;

interface AddExpenseSheetProps {
  visible: boolean;
  mode: AddExpenseMode;
  /** `take_out`: the drawer's "Take out cash" — owner took cash, bank deposit, loan payment. */
  scope?: ExpenseSheetScope;
  onClose: () => void;
  /** After an entry left its Undo window (sent, kept on the phone, or undone) — the drawer re-reads its cash. */
  onCommitted?: () => void;
  /** Opens with this category chosen (Profit's "No Rent recorded · Record"). */
  initialCategoryId?: string | null;
  /** Opens with this amount typed (stock receive: "Record what you paid"). */
  initialAmountCents?: number;
  initialNote?: string;
  initialIsStockPurchase?: boolean;
  /**
   * "Mark paid" on a bill: titled "Pay Rent", a fixed bill's amount typed in
   * (a changing one offers "Usual" / "Last" chips), its category and source
   * picked, and the saved expense linked to that due date.
   */
  bill?: BillPayContext | null;
}

/**
 * The Add-expense sheet (plan §5.1): amount first on our own keypad, where the
 * money came from, a repeat row, the store's top categories, then Save —
 * three taps for a repeat. "Save" closes it; "Save + next" keeps it open and
 * empty for the next line of a palengke run. Either way the global undo bar
 * (`ExpenseUndoHost`) says "Saved · … · Undo" for 6 s, on whatever screen is
 * left. In drawer mode it is "Pay from the drawer": today, from that drawer.
 */
export function AddExpenseSheet({
  visible,
  mode,
  scope = "spend",
  onClose,
  onCommitted,
  initialCategoryId = null,
  initialAmountCents,
  initialNote,
  initialIsStockPurchase,
  bill = null,
}: AddExpenseSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isCentered = useCenteredDialog();
  const sizing = sheetSizing(height);

  const { categories, isLoading: isLoadingCategories, error: categoriesError } = useExpenseCategories();
  const { expenses: recent } = useRecentExpenses(visible);
  const tracksStock = useTracksStock();
  const { isSaving, save } = useExpenseSave({ mode, tracksStock, onCommitted, bill });

  const opening = { initialCategoryId, initialAmountCents, initialNote, initialIsStockPurchase, bill };
  const [form, setForm] = useState<AddExpenseForm>(() => formForOpening({ ...opening, today: manilaToday(), paidFrom: "cash" }));
  const [panel, setPanel] = useState<Panel>(null);
  const [receipt, setReceipt] = useState<CapturedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The caller's values are applied every time the sheet opens, and again if they change while open.
  const openKey = visible
    ? JSON.stringify([initialCategoryId, initialAmountCents ?? null, initialNote ?? null, initialIsStockPurchase ?? null, bill?.billId ?? null, bill?.dueOn ?? null])
    : null;
  const lastOpenKey = useRef(openKey);
  useEffect(() => {
    if (openKey === lastOpenKey.current) return;
    lastOpenKey.current = openKey;
    if (openKey === null) return;
    setForm((current) => formForOpening({ ...opening, today: manilaToday(), paidFrom: current.paidFrom }));
    setPanel(null);
    setReceipt(null);
    setError(null);
    // `opening` is read only when the key (which is built from it) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const offered = useMemo(() => categoriesForScope(categories, scope, bill), [categories, scope, bill]);
  const ranked = useMemo(() => rankCategoriesForPicker(offered, recent, new Date()), [offered, recent]);
  const isBill = bill !== null;
  const suggestions = useMemo(
    () => (scope === "take_out" || isBill ? [] : repeatSuggestions(recent, offered)),
    [recent, offered, scope, isBill],
  );
  const billChips = bill && bill.amountCents === null ? amountChips(bill.usualCents, bill.lastCents) : [];
  const category: ExpenseCategory | null = offered.find((c) => c.id === form.categoryId) ?? null;
  const cents = keypadCents(form.keypad);
  const isDrawer = mode.kind === "drawer";
  const hasNextButton = !isDrawer && scope === "spend" && !isBill;
  const today = manilaToday();

  const update = (next: AddExpenseForm) => {
    setForm(next);
    setError(null);
  };

  const close = () => {
    if (isSaving) return;
    setPanel(null);
    setReceipt(null);
    setError(null);
    onClose();
  };

  // Android back steps out of an inner panel (all categories, date, note,
  // paid to) first, so the typed amount is never lost to one press.
  const back = () => {
    if (panel !== null) {
      setPanel(null);
      return;
    }
    close();
  };

  const onKey = (key: KeypadKey) => {
    const keypad = pressKey(form.keypad, key);
    if (keypad !== form.keypad) update({ ...form, keypad });
  };

  const pickReceipt = () => promptForReceipt(receipt, setReceipt);

  const submit = async (keepOpen: boolean) => {
    const outcome = await save({ form, category, receipt });
    if (outcome.status === "invalid") {
      setError(outcome.reason);
      if (outcome.field === "note") setPanel("note");
      return;
    }
    if (outcome.status === "failed") {
      setError(outcome.reason);
      return;
    }
    if (outcome.status !== "saved") return;
    if (!keepOpen) {
      close();
      return;
    }
    setForm(nextEntryForm(form));
    setReceipt(null);
    setPanel(null);
    setError(null);
  };

  const togglePanel = (next: Exclude<Panel, null>) => setPanel(panel === next ? null : next);
  const extras = expenseExtras({
    form,
    today,
    hasReceipt: receipt !== null,
    isNoteNeeded: category?.needsNote === true,
    canPickDateAndPayee: !isDrawer,
    openPanel: panel,
    onPhoto: pickReceipt,
    onNote: () => togglePanel("note"),
    onDate: () => setPanel("date"),
    onPaidTo: () => togglePanel("paidTo"),
  });

  const afterCents = drawerAfterCents(mode, cents);
  const isTyping = panel === "note" || panel === "paidTo";
  const label = primaryLabel(cents, mode, scope, form.categoryId !== null, bill);
  const sheetFrame = isCentered
    ? [centeredDialog.sheet, { height: Math.min(height - spacing.xl * 2, MAX_DIALOG_HEIGHT), paddingBottom: spacing.lg }]
    : { flex: 1, marginTop: insets.top + SCRIM_GAP, paddingBottom: Math.max(insets.bottom, spacing.md) };

  const categoryBlock =
    isLoadingCategories && categories.length === 0 ? (
      <Text style={styles.hint}>Loading categories…</Text>
    ) : categoriesError && categories.length === 0 ? (
      <Text style={styles.error}>Categories could not be loaded. {categoriesError}</Text>
    ) : (
      <CategoryGrid
        ranked={ranked}
        selectedId={form.categoryId}
        totalCount={offered.length}
        onPick={(picked) => update(selectCategory(form, picked.id))}
        onShowAll={() => setPanel("all")}
      />
    );

  const mainBody = (
    <>
      <View style={styles.top}>
        {mode.kind === "drawer" ? <DrawerLine chipLabel={drawerChipLabel(mode)} availableCents={mode.availableCents} /> : null}
        {bill ? (
          <Text style={styles.billFor} testID="expense-bill-for">
            {payForLine(bill.dueOn, today)}
          </Text>
        ) : null}
        <ExpenseAmount text={keypadDisplay(form.keypad)} cents={cents} baseSize={sizing.amount} />
        {billChips.length > 0 ? (
          <View style={styles.billChips}>
            {billChips.map((chip) => (
              <Chip
                key={chip.label}
                label={chip.label}
                isOn={cents === chip.cents}
                onPress={() => update({ ...form, keypad: keypadFromCents(chip.cents) })}
              />
            ))}
          </View>
        ) : null}
        {mode.kind === "book" ? <PaidFromRow value={form.paidFrom} onPick={(paidFrom) => update({ ...form, paidFrom })} /> : null}
      </View>
      <View style={styles.middle}>
        <ScrollView contentContainerStyle={styles.middleBody} keyboardShouldPersistTaps="handled">
          <RepeatRow suggestions={suggestions} onPick={(suggestion) => update(applyRepeat(form, suggestion))} />
          {categoryBlock}
          {asksStockQuestion(category, tracksStock) ? (
            <StockQuestion value={form.isStockPurchase} onAnswer={(answer) => update({ ...form, isStockPurchase: answer })} />
          ) : null}
          <ExtrasRow items={extras} />
          {panel === "note" ? (
            <FoldInput
              value={form.note}
              onChange={(note) => update(withNote(form, note, offered))}
              placeholder={category?.needsNote ? "What was it for? (needed)" : "What was it for? e.g. palengke"}
              maxLength={NOTE_MAX}
              accessibilityLabel="Note"
              onDone={() => setPanel(null)}
            />
          ) : null}
          {panel === "paidTo" ? (
            <FoldInput
              value={form.paidToName}
              onChange={(paidToName) => update({ ...form, paidToName })}
              placeholder="Who was paid, e.g. Aling Nena, Meralco"
              maxLength={PAID_TO_MAX}
              accessibilityLabel="Paid to"
              onDone={() => setPanel(null)}
            />
          ) : null}
          {afterCents !== null ? (
            <Text style={styles.after}>
              After this the drawer should hold <Text style={styles.strong}>{formatPeso(afterCents)}</Text>
            </Text>
          ) : null}
        </ScrollView>
        <ExpenseUndoBar style={styles.undo} />
      </View>
      <View style={styles.lower}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {isTyping ? null : <ExpenseKeypad onKey={onKey} keyHeight={sizing.key} isDisabled={isSaving} />}
        <View style={styles.footer}>
          {hasNextButton ? (
            <Button
              label="Save + next"
              tone="secondary"
              size="lg"
              onPress={() => void submit(true)}
              disabled={!canTapSave(form) || isSaving}
              accessibilityHint="Saves this and keeps the sheet open for the next one"
              style={styles.nextButton}
              testID="expense-save-next"
            />
          ) : null}
          <Button
            label={label}
            size="lg"
            onPress={() => void submit(false)}
            isLoading={isSaving}
            disabled={!canTapSave(form) || isSaving}
            accessibilityLabel={cents > 0 ? label.replace(formatPeso(cents), spokenCents(cents)) : label}
            style={styles.saveButton}
            testID="expense-save"
          />
        </View>
      </View>
      {panel === "date" && !IS_DATE_PICKER_INLINE ? (
        <ExpenseDatePicker value={form.spentOn} today={today} onPick={(spentOn) => update({ ...form, spentOn })} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back} transparent>
      <KeyboardAvoidingView
        style={[styles.backdrop, isCentered && centeredDialog.backdrop]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, sheetFrame]}>
          {isCentered ? null : <View style={styles.grab} />}
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {sheetTitle(mode, scope, bill)}
            </Text>
            <TouchableOpacity onPress={close} disabled={isSaving} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {panel === "all" ? (
            <View style={styles.middle}>
              <BackRow label="All categories" onBack={() => setPanel(null)} />
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.middleBody}>
                <CategoryList
                  categories={offered}
                  selectedId={form.categoryId}
                  onPick={(picked) => {
                    update(selectCategory(form, picked.id));
                    setPanel(null);
                  }}
                />
              </ScrollView>
            </View>
          ) : panel === "date" && IS_DATE_PICKER_INLINE ? (
            <ExpenseDatePicker value={form.spentOn} today={today} onPick={(spentOn) => update({ ...form, spentOn })} onClose={() => setPanel(null)} />
          ) : (
            mainBody
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: radius.full, backgroundColor: colors.separator },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
  title: { ...typography.title, color: colors.textPrimary, flex: 1 },
  cancel: { minHeight: 44, justifyContent: "center", paddingLeft: spacing.sm },
  cancelText: { ...typography.body, fontWeight: "600", color: colors.textSecondary },
  top: { gap: spacing.sm },
  billFor: { ...typography.caption, fontWeight: "600", color: colors.textMuted },
  billChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  middle: { flex: 1 },
  middleBody: { gap: spacing.md, paddingBottom: spacing.md },
  undo: { position: "absolute", left: 0, right: 0, bottom: spacing.sm },
  after: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  strong: { fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  hint: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, fontWeight: "700", color: colors.danger },
  lower: { gap: spacing.sm },
  footer: { flexDirection: "row", gap: spacing.sm },
  nextButton: {
    flex: 0.62,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.surfaceSubtle,
  },
  saveButton: { flex: 1, paddingHorizontal: spacing.md },
});
