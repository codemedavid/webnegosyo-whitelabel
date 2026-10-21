import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { NOTE_MAX } from "../../lib/expenses/add-expense-form";
import { PAID_FROM_LABELS, PICKABLE_PAID_FROM, formatCents } from "../../lib/expenses/expense-format";
import { VOID_REASON_MAX, type ExpensePatch } from "../../lib/expenses/expense-service";
import { buildFixPatch } from "../../lib/expenses/fix-patch";
import type { Expense, ExpenseCategory, PaidFrom } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { CashInput, DrawerSheet, sheetText } from "../drawer/DrawerSheet";
import { AllCategories, Chip } from "./AddExpenseParts";

const VOID_REASONS = ["Recorded twice", "Wrong amount", "Not ours", "Wrong category"] as const;

function ReasonField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <>
      <Text style={sheetText.label}>Why</Text>
      <View style={styles.reasons}>
        {VOID_REASONS.map((reason) => (
          <Chip key={reason} label={reason} isOn={value === reason} onPress={() => onChange(reason)} />
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Or type the reason"
        placeholderTextColor={colors.textTertiary}
        maxLength={VOID_REASON_MAX}
        accessibilityLabel="Reason"
      />
    </>
  );
}

/**
 * Void with a reason (plan §2.5): the row stays, struck through, and the
 * history says who and why. A drawer expense on an open shift also puts the
 * cash back into that drawer (contract §5).
 */
export function VoidExpenseSheet({
  expense,
  drawerNote,
  onConfirm,
  onClose,
}: {
  expense: Expense;
  /** "Voiding puts ₱1,250 back in the drawer." for a drawer row. */
  drawerNote: string | null;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const inFlight = useRef(false);

  const submit = async () => {
    if (inFlight.current) return;
    if (!reason.trim()) {
      setError("Say why — a short reason is enough.");
      return;
    }
    inFlight.current = true;
    setIsBusy(true);
    try {
      await onConfirm(reason.trim());
    } catch (voidError) {
      setError(voidError instanceof Error ? voidError.message : "Could not void it. Try again.");
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
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
      <ReasonField value={reason} onChange={(text) => { setReason(text); setError(null); }} />
      {error ? <Text style={sheetText.error}>{error}</Text> : null}
      <Button label="Void expense" tone="danger" size="lg" onPress={() => void submit()} isLoading={isBusy} disabled={isBusy} />
    </DrawerSheet>
  );
}

/**
 * Fix = void + a corrected copy (plan §2.5). A drawer row keeps its amount,
 * date and drawer — the cash really left — so only its category and note can
 * change.
 */
export function FixExpenseSheet({
  expense,
  categories,
  onConfirm,
  onClose,
}: {
  expense: Expense;
  categories: readonly ExpenseCategory[];
  onConfirm: (reason: string, patch: ExpensePatch) => Promise<void>;
  onClose: () => void;
}) {
  const isDrawer = expense.paidFrom === "drawer";
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [note, setNote] = useState(expense.note ?? "");
  const [amountText, setAmountText] = useState((expense.amountCents / 100).toFixed(2));
  const [paidFrom, setPaidFrom] = useState<Exclude<PaidFrom, "drawer"> | null>(isDrawer ? null : (expense.paidFrom as Exclude<PaidFrom, "drawer">));
  const [reason, setReason] = useState("");
  const [isPickingCategory, setIsPickingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const inFlight = useRef(false);
  const category = categories.find((c) => c.id === categoryId);

  const submit = async () => {
    if (inFlight.current) return;
    const { patch, error: patchError } = buildFixPatch(expense, { categoryId, note, amountText, paidFrom });
    if (patchError) return setError(patchError);
    if (!patch) return setError("Nothing changed yet.");
    if (category?.needsNote && !note.trim()) return setError("Add a note for this category.");
    if (!reason.trim()) return setError("Say why you are fixing it.");
    inFlight.current = true;
    setIsBusy(true);
    try {
      await onConfirm(reason.trim(), patch);
    } catch (fixError) {
      setError(fixError instanceof Error ? fixError.message : "Could not save the fix. Try again.");
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  };

  if (isPickingCategory) {
    return (
      <DrawerSheet visible title="Category" onClose={() => setIsPickingCategory(false)} closeLabel="Back">
        <View style={styles.all}>
          <AllCategories
            categories={categories}
            selectedId={categoryId}
            onPick={(picked) => {
              setCategoryId(picked.id);
              setIsPickingCategory(false);
              setError(null);
            }}
            onBack={() => setIsPickingCategory(false)}
          />
        </View>
      </DrawerSheet>
    );
  }

  return (
    <DrawerSheet
      visible
      title="Fix this expense"
      subtitle={isDrawer ? "Paid from a drawer: the amount and date stay. Change what it was for." : "The old entry is voided and a corrected one replaces it."}
      onClose={onClose}
      isBusy={isBusy}
    >
      <Text style={sheetText.label}>Category</Text>
      <Chip label={category?.name ?? "Pick a category"} icon="list" onPress={() => setIsPickingCategory(true)} />
      {!isDrawer ? (
        <>
          <Text style={sheetText.label}>Amount</Text>
          <CashInput value={amountText} onChangeText={(text) => { setAmountText(text); setError(null); }} accessibilityLabel="Amount in pesos" />
          <Text style={sheetText.label}>Paid from</Text>
          <View style={styles.reasons}>
            {PICKABLE_PAID_FROM.map((source) => (
              <Chip key={source} label={PAID_FROM_LABELS[source]} isOn={paidFrom === source} onPress={() => setPaidFrom(source)} />
            ))}
          </View>
        </>
      ) : null}
      <Text style={sheetText.label}>Note</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={(text) => { setNote(text); setError(null); }}
        placeholder={category?.needsNote ? "What was it for? (needed)" : "What was it for?"}
        placeholderTextColor={colors.textTertiary}
        maxLength={NOTE_MAX}
        accessibilityLabel="Note"
      />
      <ReasonField value={reason} onChange={(text) => { setReason(text); setError(null); }} />
      {error ? <Text style={sheetText.error}>{error}</Text> : null}
      <Button label="Save the fix" size="lg" onPress={() => void submit()} isLoading={isBusy} disabled={isBusy} />
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  drawerNote: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  all: { height: 440 },
});
