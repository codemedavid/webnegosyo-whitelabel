import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { NOTE_MAX } from "../../lib/expenses/add-expense-form";
import { rankCategoriesForPicker } from "../../lib/expenses/categories";
import {
  CHANGE_REASONS,
  VOID_REASONS,
  changeCategoryChoices,
  checkChange,
  checkVoidReason,
} from "../../lib/expenses/expense-detail-sheets";
import { PAID_FROM_LABELS, PICKABLE_PAID_FROM, formatCents } from "../../lib/expenses/expense-format";
import { VOID_REASON_MAX, type ExpensePatch } from "../../lib/expenses/expense-service";
import type { Expense, ExpenseCategory, PaidFrom } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { CashInput, DrawerSheet, sheetText } from "../drawer/DrawerSheet";
import { CategoryGrid, CategoryList } from "./CategoryPicker";
import { ChoicePill, PillRow, ReasonField, TextField } from "./detail/SheetParts";

/** Turns a thrown write into words for the sheet. */
function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** One write at a time: a double tap must never void or change twice. */
function useSingleFlight() {
  const inFlight = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const run = async (write: () => Promise<void>, onError: (error: unknown) => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsBusy(true);
    try {
      await write();
    } catch (error) {
      onError(error);
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  };
  return { isBusy, run };
}

interface VoidExpenseSheetProps {
  expense: Expense;
  /** "Voiding puts ₱1,250 back in the drawer." for a drawer row. */
  drawerNote: string | null;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Void with a reason: the row stays, struck through, and the history says who
 * and why. A drawer expense on an open shift also puts the cash back.
 */
export function VoidExpenseSheet({ expense, drawerNote, onConfirm, onClose }: VoidExpenseSheetProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isBusy, run } = useSingleFlight();

  const submit = () => {
    const checked = checkVoidReason(reason);
    if (checked.error !== null) return setError(checked.error);
    void run(() => onConfirm(checked.reason), (voidError) => setError(messageOf(voidError, "Could not void it. Try again.")));
  };

  return (
    <DrawerSheet
      visible
      title={`Void ${formatCents(expense.amountCents, { compact: true })}?`}
      subtitle="It stays in the book, struck through, with your reason."
      onClose={onClose}
      isBusy={isBusy}
    >
      {drawerNote ? <Text style={styles.drawerNote}>{drawerNote}</Text> : null}
      <ReasonField
        reasons={VOID_REASONS}
        value={reason}
        maxLength={VOID_REASON_MAX}
        onChange={(text) => {
          setReason(text);
          setError(null);
        }}
      />
      {error ? <Text style={sheetText.error}>{error}</Text> : null}
      <Button label="Void expense" tone="danger" size="lg" onPress={submit} isLoading={isBusy} disabled={isBusy} testID="void-confirm" />
    </DrawerSheet>
  );
}

interface ChangeExpenseSheetProps {
  expense: Expense;
  categories: readonly ExpenseCategory[];
  /** Recent rows, so the grid leads with the store's usual categories. */
  recent?: readonly Expense[];
  onConfirm: (reason: string, patch: ExpensePatch) => Promise<void>;
  onClose: () => void;
}

type ChangeStep = "form" | "categories";
type BookSource = Exclude<PaidFrom, "drawer">;
const NO_RECENT: readonly Expense[] = [];

/**
 * Change = void + a corrected copy; the old version stays in the history. A
 * drawer row keeps its amount, date and drawer — the cash really left — so only
 * its category and note can change. "All categories" swaps in place, and its
 * "Back" (Android's too) returns to the form with the edit kept. A category
 * the store has since archived still shows as the chosen one.
 */
export function ChangeExpenseSheet({ expense, categories, recent = NO_RECENT, onConfirm, onClose }: ChangeExpenseSheetProps) {
  const isDrawer = expense.paidFrom === "drawer";
  const [step, setStep] = useState<ChangeStep>("form");
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [note, setNote] = useState(expense.note ?? "");
  const [amountText, setAmountText] = useState((expense.amountCents / 100).toFixed(2));
  const [paidFrom, setPaidFrom] = useState<BookSource | null>(isDrawer ? null : (expense.paidFrom as BookSource));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isBusy, run } = useSingleFlight();
  const choices = useMemo(() => changeCategoryChoices(categories, expense.categoryId), [categories, expense.categoryId]);
  const ranked = useMemo(() => rankCategoriesForPicker(choices, recent, new Date()), [choices, recent]);
  const category = choices.find((candidate) => candidate.id === categoryId);

  const edited = (apply: () => void) => {
    apply();
    setError(null);
  };
  const pick = (picked: ExpenseCategory) => {
    edited(() => setCategoryId(picked.id));
    setStep("form");
  };
  const submit = () => {
    const checked = checkChange(expense, { categoryId, note, amountText, paidFrom }, reason, category);
    if (checked.error !== null) return setError(checked.error);
    void run(() => onConfirm(checked.reason, checked.patch), (changeError) => setError(messageOf(changeError, "Could not save the change. Try again.")));
  };

  if (step === "categories") {
    return (
      <DrawerSheet visible title="Pick a category" onClose={() => setStep("form")} closeLabel="Back" isBusy={isBusy}>
        <CategoryList categories={choices} selectedId={categoryId} onPick={pick} />
      </DrawerSheet>
    );
  }

  return (
    <DrawerSheet
      visible
      title="Change this expense"
      subtitle={
        isDrawer
          ? "Paid from a drawer, so the amount and date stay. The old version is kept in the history."
          : "The old version is kept in the history."
      }
      onClose={onClose}
      isBusy={isBusy}
    >
      <Text style={sheetText.label}>Category</Text>
      <CategoryGrid ranked={ranked} selectedId={categoryId} onPick={pick} onShowAll={() => setStep("categories")} />
      {!isDrawer ? (
        <>
          <Text style={sheetText.label}>Amount</Text>
          <CashInput value={amountText} onChangeText={(text) => edited(() => setAmountText(text))} accessibilityLabel="Amount in pesos" />
          <Text style={sheetText.label}>Paid from</Text>
          <PillRow>
            {PICKABLE_PAID_FROM.map((source) => (
              <ChoicePill key={source} label={PAID_FROM_LABELS[source]} isOn={paidFrom === source} onPress={() => edited(() => setPaidFrom(source))} />
            ))}
          </PillRow>
        </>
      ) : null}
      <Text style={sheetText.label}>Note</Text>
      <TextField
        value={note}
        onChange={(text) => edited(() => setNote(text))}
        placeholder={category?.needsNote ? "What was it for? (needed)" : "What was it for?"}
        maxLength={NOTE_MAX}
        accessibilityLabel="Note"
      />
      <ReasonField reasons={CHANGE_REASONS} value={reason} maxLength={VOID_REASON_MAX} onChange={(text) => edited(() => setReason(text))} />
      {error ? <Text style={sheetText.error}>{error}</Text> : null}
      <Button label="Save the change" size="lg" onPress={submit} isLoading={isBusy} disabled={isBusy} testID="change-confirm" />
    </DrawerSheet>
  );
}

/** The pre-redesign name; same props and callbacks. */
export const FixExpenseSheet = ChangeExpenseSheet;

const styles = StyleSheet.create({
  drawerNote: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
