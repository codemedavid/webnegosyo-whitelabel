import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AMOUNT_MODES,
  EDIT_NOTE,
  applyPreset,
  billCategories,
  checkBillForm,
  formFromBill,
  formFromPrefill,
  offeredPresets,
  pickCategory,
  type BillEditorForm,
  type BillFormField,
} from "../../../lib/expenses/bill-editor-form";
import { BILL_NAME_MAX, BILL_PAID_TO_MAX, type Bill, type BillPayment } from "../../../lib/expenses/bill-schedule";
import type { BillPrefill } from "../../../lib/expenses/bills-route";
import { categoryLook, shortCategoryName } from "../../../lib/expenses/category-look";
import { PAID_FROM_LABELS, PICKABLE_PAID_FROM } from "../../../lib/expenses/expense-format";
import { keypadCents, keypadDisplay, pressKey, type KeypadKey } from "../../../lib/expenses/keypad";
import type { ExpenseCategory } from "../../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { centeredDialog, useCenteredDialog } from "../../pos/dialog-layout";
import { SegmentedControl } from "../../SegmentedControl";
import { BackRow } from "../AddExpenseParts";
import { CategoryList } from "../CategoryPicker";
import { CategoryTile } from "../CategoryTile";
import { ExpenseAmount } from "../ExpenseAmount";
import { COMPACT_KEY_HEIGHT, ExpenseKeypad } from "../ExpenseKeypad";
import { Chip, ChipRow, Field } from "./BillEditorParts";
import { RemindField, ScheduleFields } from "./BillScheduleFields";
import type { BillWrites } from "./use-bill-writes";

const SHEET_RADIUS = 22;
const SCRIM_GAP = 8;
const MAX_DIALOG_HEIGHT = 820;
const AMOUNT_SIZE = 40;

export type BillEditorMode = { kind: "new"; prefill: BillPrefill } | { kind: "edit"; bill: Bill };

export interface BranchChoice {
  id: string;
  name: string;
}

interface BillEditorSheetProps {
  mode: BillEditorMode;
  categories: readonly ExpenseCategory[];
  /** Branches to choose from; empty hides the choice (one branch, or a branch account). */
  branches: readonly BranchChoice[];
  /** A new bill's branch: the account's own, else the one being viewed, else the whole store. */
  defaultOutletId: string | null;
  payments: readonly BillPayment[];
  today: string;
  writes: BillWrites;
  onSaved: (bill: Bill, isNew: boolean) => void;
  onClose: () => void;
}

/**
 * Add or change a bill: a preset to start (never an Ingredients category),
 * its name, same-or-changing amount on the expense keypad, how often in plain
 * sentences with the next three dates live, when to remind, where it is
 * usually paid from and to whom. "Other…" swaps in the category list in place;
 * Android back steps out of it before closing.
 */
export function BillEditorSheet({ mode, categories, branches, defaultOutletId, payments, today, writes, onSaved, onClose }: BillEditorSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isCentered = useCenteredDialog();
  const isEditing = mode.kind === "edit";
  const [form, setForm] = useState<BillEditorForm>(() =>
    mode.kind === "edit" ? formFromBill(mode.bill) : formFromPrefill(today, defaultOutletId, mode.prefill, categories),
  );
  const [isPickingCategory, setIsPickingCategory] = useState(false);
  const [error, setError] = useState<{ field: BillFormField | null; message: string } | null>(null);

  const offered = useMemo(() => billCategories(categories), [categories]);
  const presets = useMemo(() => offeredPresets(categories), [categories]);
  const category = offered.find((candidate) => candidate.id === form.categoryId) ?? categories.find((c) => c.id === form.categoryId) ?? null;
  const cents = keypadCents(form.keypad);

  const update = (next: BillEditorForm) => {
    setForm(next);
    setError(null);
  };
  const close = () => {
    if (!writes.isBusy) onClose();
  };
  const back = () => (isPickingCategory ? setIsPickingCategory(false) : close());

  const save = async () => {
    const savedStartsOn = mode.kind === "edit" ? mode.bill.startsOn : null;
    const check = checkBillForm(form, today, savedStartsOn);
    if (!check.ok) {
      setError({ field: check.field, message: check.message });
      return;
    }
    const result = mode.kind === "edit" ? await writes.update(mode.bill.id, check.input, today, mode.bill.startsOn) : await writes.create(check.input, today);
    if (!result.ok) {
      if (result.message) setError({ field: null, message: result.message });
      return;
    }
    onSaved(result.value, mode.kind === "new");
  };

  const onKey = (key: KeypadKey) => {
    const keypad = pressKey(form.keypad, key);
    if (keypad !== form.keypad) update({ ...form, keypad });
  };

  const sheetFrame = isCentered
    ? [centeredDialog.sheet, { height: Math.min(height - spacing.xl * 2, MAX_DIALOG_HEIGHT), paddingBottom: spacing.lg }]
    : { flex: 1, marginTop: insets.top + SCRIM_GAP, paddingBottom: Math.max(insets.bottom, spacing.md) };

  const presetRow = isEditing ? null : (
    <ChipRow>
      {presets.map((preset) => (
        <Chip key={preset.key} label={preset.name} isOn={form.presetKey === preset.key} onPress={() => update(applyPreset(form, preset, categories))} />
      ))}
      <Chip
        label="Other…"
        isDashed
        isOn={form.presetKey === null && form.categoryId !== null}
        onPress={() => setIsPickingCategory(true)}
        accessibilityLabel="Other bill: pick a category"
      />
    </ChipRow>
  );

  const formBody = (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {presetRow}
      <Field label="Name">
        <TextInput
          style={[styles.input, error?.field === "name" && styles.inputError]}
          value={form.name}
          onChangeText={(name) => update({ ...form, name })}
          placeholder="e.g. Rent, Kuryente, Sahod"
          placeholderTextColor={colors.textTertiary}
          maxLength={BILL_NAME_MAX}
          accessibilityLabel="Bill name"
        />
      </Field>
      <Field label="What it's for">
        <TouchableOpacity
          style={[styles.categoryLine, error?.field === "categoryId" && styles.inputError]}
          onPress={() => setIsPickingCategory(true)}
          accessibilityRole="button"
          accessibilityLabel={category ? `Category: ${category.name}. Change` : "Pick a category"}
          testID="bill-category"
        >
          {category ? <CategoryTile look={categoryLook(category)} size={30} /> : null}
          <Text style={[styles.categoryText, !category && styles.placeholder]} numberOfLines={1}>
            {category ? shortCategoryName(category.name) : "Pick a category"}
          </Text>
          <Text style={styles.change}>{category ? "Change" : "Pick"}</Text>
        </TouchableOpacity>
      </Field>
      <Field label="Amount">
        <SegmentedControl options={AMOUNT_MODES} value={form.amountMode} onChange={(amountMode) => update({ ...form, amountMode })} accessibilityPrefix="Amount" />
        {form.amountMode === "fixed" ? (
          <>
            <ExpenseAmount text={keypadDisplay(form.keypad)} cents={cents} baseSize={AMOUNT_SIZE} />
            <ExpenseKeypad onKey={onKey} keyHeight={COMPACT_KEY_HEIGHT} isDisabled={writes.isBusy} />
          </>
        ) : (
          <Text style={styles.hint}>You type what you paid each time. We show about how much from the last ones.</Text>
        )}
      </Field>
      <ScheduleFields
        form={form}
        today={today}
        isEditing={isEditing}
        billId={mode.kind === "edit" ? mode.bill.id : undefined}
        payments={payments}
        onChange={update}
      />
      <RemindField value={form.remindDaysBefore} onChange={(remindDaysBefore) => update({ ...form, remindDaysBefore })} />
      <Field label="Usually paid from">
        <ChipRow>
          {PICKABLE_PAID_FROM.map((source) => (
            <Chip
              key={source}
              label={PAID_FROM_LABELS[source]}
              isOn={form.paidFrom === source}
              onPress={() => update({ ...form, paidFrom: source })}
              accessibilityLabel={`Usually paid from ${PAID_FROM_LABELS[source]}`}
            />
          ))}
        </ChipRow>
      </Field>
      <Field label="Paid to (optional)">
        <TextInput
          style={styles.input}
          value={form.paidToName}
          onChangeText={(paidToName) => update({ ...form, paidToName })}
          placeholder="e.g. Aling Nena, Meralco"
          placeholderTextColor={colors.textTertiary}
          maxLength={BILL_PAID_TO_MAX}
          accessibilityLabel="Paid to"
        />
      </Field>
      {branches.length > 1 ? (
        <Field label="For">
          <ChipRow>
            <Chip label="Whole store" isOn={form.outletId === null} onPress={() => update({ ...form, outletId: null })} />
            {branches.map((branch) => (
              <Chip key={branch.id} label={branch.name} isOn={form.outletId === branch.id} onPress={() => update({ ...form, outletId: branch.id })} />
            ))}
          </ChipRow>
        </Field>
      ) : null}
      {isEditing ? <Text style={styles.hint}>{EDIT_NOTE}</Text> : null}
    </ScrollView>
  );

  const categoryBody = (
    <View style={styles.flex}>
      <BackRow label="What it's for" onBack={() => setIsPickingCategory(false)} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <CategoryList
          categories={offered}
          selectedId={form.categoryId}
          onPick={(picked) => {
            update(pickCategory(form, picked));
            setIsPickingCategory(false);
          }}
        />
      </ScrollView>
    </View>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={back} transparent>
      <KeyboardAvoidingView style={[styles.backdrop, isCentered && centeredDialog.backdrop]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, sheetFrame]}>
          {isCentered ? null : <View style={styles.grab} />}
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {isEditing ? `Change ${mode.bill.name}` : "Add a bill"}
            </Text>
            <TouchableOpacity onPress={close} disabled={writes.isBusy} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {isPickingCategory ? categoryBody : formBody}
          {isPickingCategory ? null : (
            <View style={styles.footer}>
              {error ? (
                <Text style={styles.error} accessibilityRole="alert" testID="bill-editor-error">
                  {error.message}
                </Text>
              ) : null}
              <Button
                label={isEditing ? "Save changes" : "Add bill"}
                size="lg"
                onPress={() => void save()}
                isLoading={writes.isBusy}
                disabled={writes.isBusy}
                testID="bill-save"
              />
            </View>
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
  flex: { flex: 1 },
  body: { gap: spacing.lg, paddingBottom: spacing.lg },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1.5,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  inputError: { borderColor: colors.accent },
  categoryLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.separator,
  },
  categoryText: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flex: 1 },
  placeholder: { color: colors.textTertiary, fontWeight: "400" },
  change: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  footer: { gap: spacing.sm },
  error: { ...typography.caption, fontWeight: "700", color: colors.danger },
});
