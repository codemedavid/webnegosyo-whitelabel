import React, { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { newLocalOrderId } from "../../lib/offline/local-id";
import { readActorName } from "../../lib/expenses/actor-name";
import {
  applyRepeat,
  asksStockQuestion,
  canTapSave,
  categoriesForScope,
  checkForm,
  dateChoices,
  emptyForm,
  nextEntryForm,
  NOTE_MAX,
  PAID_TO_MAX,
  saveLabel,
  savedMessage,
  selectCategory,
  toBookDraft,
  toDrawerDraft,
  type AddExpenseForm,
  type AddExpenseMode,
} from "../../lib/expenses/add-expense-form";
import { rankCategoriesForPicker } from "../../lib/expenses/categories";
import { dayLabel, manilaToday, spokenCents } from "../../lib/expenses/expense-format";
import type { QueuedExpensePayload } from "../../lib/expenses/expense-queue";
import { formatPeso, keypadCents, keypadDisplay, pressKey, type KeypadKey } from "../../lib/expenses/keypad";
import {
  commitQueuedExpense,
  queueExpense,
  queueReceipt,
  undoExpense,
} from "../../lib/expenses/live-expense-queue";
import { captureReceipt, describeCaptureOutcome, type CapturedReceipt } from "../../lib/expenses/receipt-files";
import { repeatSuggestions } from "../../lib/expenses/repeat-chips";
import {
  useExpenseCategories,
  useExpenseOutlet,
  useExpenseTenant,
  useInvalidateExpenses,
  useRecentExpenses,
  useTracksStock,
} from "../../lib/expenses/use-expenses";
import type { ExpenseCategory } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Modal } from "../Modal";
import { UndoBar } from "../UndoBar";
import { COMPACT_KEY_HEIGHT, ExpenseKeypad, KEY_HEIGHT } from "./ExpenseKeypad";
import {
  AllCategories,
  CategoryGrid,
  DateChoices,
  FoldInput,
  FoldedRow,
  PaidFromChoices,
  PaidFromPill,
  RepeatRow,
  StockQuestion,
  type FoldPanel,
} from "./AddExpenseParts";

/** How long "Saved · LPG ₱1,250 · Undo" stays, and how long the entry waits unsent (plan §5.1). */
export const UNDO_WINDOW_MS = 6_000;
/** Below this window height the keypad shrinks before the amount does (plan §5.6). */
const COMPACT_HEIGHT = 740;

export type ExpenseSheetScope = "spend" | "take_out";

interface AddExpenseSheetProps {
  visible: boolean;
  mode: AddExpenseMode;
  /** `take_out`: the drawer's "Take out cash" — owner took cash, bank deposit, loan payment. */
  scope?: ExpenseSheetScope;
  onClose: () => void;
  /** After an entry left its Undo window (sent, or kept on the phone) — the drawer re-reads its cash. */
  onCommitted?: () => void;
  /** Opens with this category chosen (Profit's "No Rent recorded · Record"). */
  initialCategoryId?: string | null;
}

interface Snack {
  requestId: string;
  message: string;
  actorName: string;
}

/**
 * The Add-expense sheet (plan §5.1): amount first on our own keypad, a repeat
 * row, the top categories, then Save — three taps for a repeat, type → chip →
 * Save for a new one. After Save it stays open and empty for the next entry
 * (palengke runs come in batches) and shows "Saved · … · Undo" for 6 s.
 *
 * Every entry goes through the device queue with its own request id and is
 * held for the Undo window, so Undo never has to void anything, a dead zone
 * never loses an entry, and a replay can never record it twice.
 */
export function AddExpenseSheet({ visible, mode, scope = "spend", onClose, onCommitted, initialCategoryId = null }: AddExpenseSheetProps) {
  const tenantId = useExpenseTenant();
  const outletId = useExpenseOutlet();
  const invalidate = useInvalidateExpenses();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyHeight = height < COMPACT_HEIGHT ? COMPACT_KEY_HEIGHT : KEY_HEIGHT;

  const { categories, isLoading: isLoadingCategories, error: categoriesError } = useExpenseCategories();
  const { expenses: recent } = useRecentExpenses(visible);
  const tracksStock = useTracksStock();

  const today = manilaToday();
  const [form, setForm] = useState<AddExpenseForm>(() => ({ ...emptyForm(today), categoryId: initialCategoryId }));
  const [panel, setPanel] = useState<FoldPanel>(null);
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [receipt, setReceipt] = useState<CapturedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [snack, setSnack] = useState<Snack | null>(null);
  // State lands a render late: two taps inside one frame both saw isSaving false.
  const inFlight = useRef(false);
  const committed = useRef(new Set<string>());

  const offered = useMemo(() => categoriesForScope(categories, scope), [categories, scope]);
  const ranked = useMemo(() => rankCategoriesForPicker(offered, recent, new Date()), [offered, recent]);
  const suggestions = useMemo(
    () => (scope === "take_out" ? [] : repeatSuggestions(recent, offered)),
    [recent, offered, scope],
  );
  const category: ExpenseCategory | null = offered.find((c) => c.id === form.categoryId) ?? null;
  const cents = keypadCents(form.keypad);
  const isDrawer = mode.kind === "drawer";
  const verb = scope === "take_out" ? "Take out" : isDrawer ? "Pay" : "Save";
  const title = scope === "take_out" ? "Take out cash" : isDrawer ? "Pay an expense" : "New expense";

  const update = (next: AddExpenseForm) => {
    setForm(next);
    setError(null);
  };

  const commit = (requestId: string) => {
    if (!tenantId || committed.current.has(requestId)) return;
    committed.current.add(requestId);
    void commitQueuedExpense(tenantId, requestId).then(async (result) => {
      if (result.sent.size > 0) await invalidate();
      onCommitted?.();
    });
  };

  const close = () => {
    if (isSaving) return;
    // Closing is not Undo: an entry still in its window is sent now.
    if (snack) commit(snack.requestId);
    setSnack(null);
    setPanel(null);
    setIsShowingAll(false);
    setForm(emptyForm(manilaToday(), form.paidFrom));
    setReceipt(null);
    setError(null);
    onClose();
  };

  const onKey = (key: KeypadKey) => {
    const keypad = pressKey(form.keypad, key);
    if (keypad !== form.keypad) update({ ...form, keypad });
  };

  const pickReceipt = () => {
    const take = async (source: "camera" | "library") => {
      try {
        const outcome = await captureReceipt(source);
        if (outcome.status === "captured") {
          setReceipt(outcome.receipt);
          return;
        }
        const message = describeCaptureOutcome(outcome);
        if (message) Alert.alert("Receipt", message);
      } catch {
        Alert.alert("Receipt", "The photo could not be saved. Try again.");
      }
    };
    Alert.alert("Add a receipt", receipt ? "Replace the photo you took?" : undefined, [
      { text: "Take a photo", onPress: () => void take("camera") },
      { text: "Choose from gallery", onPress: () => void take("library") },
      ...(receipt ? [{ text: "Remove photo", style: "destructive" as const, onPress: () => setReceipt(null) }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const save = async () => {
    if (inFlight.current || !tenantId) return;
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    const verdict = checkForm(form, { mode, category, tracksStock, today: manilaToday() });
    if (!verdict.ok || !category) {
      setError(verdict.ok ? "Pick what it was for." : verdict.reason);
      if (!verdict.ok && verdict.field === "note") setPanel("note");
      return;
    }
    inFlight.current = true;
    setIsSaving(true);
    try {
      const clientRequestId = newLocalOrderId();
      const actorName = await readActorName();
      const payload: QueuedExpensePayload =
        mode.kind === "drawer"
          ? {
              kind: "drawer",
              input: { ...toDrawerDraft(form, { clientRequestId, shiftId: mode.shiftId, category }), recordedByName: actorName },
            }
          : {
              kind: "book",
              createdByName: actorName,
              draft: toBookDraft(form, { clientRequestId, outletId, tracksStock, category }),
            };
      const kept = await queueExpense({ tenantId, payload, categoryName: category.name }, UNDO_WINDOW_MS);
      if (!kept) {
        setError("This phone could not keep the expense. Free up some space and try again.");
        return;
      }
      if (receipt) {
        await queueReceipt({ tenantId, clientRequestId, expenseId: null, fileUri: receipt.fileUri, mime: receipt.mime });
      }
      // A second save inside the window sends the first one now.
      if (snack) commit(snack.requestId);
      setSnack({ requestId: clientRequestId, message: savedMessage(category.name, cents, false), actorName });
      setForm(nextEntryForm(form));
      setReceipt(null);
      setPanel(null);
      setError(null);
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  };

  const undo = async (current: Snack) => {
    if (!tenantId) return;
    committed.current.add(current.requestId);
    setSnack(null);
    const outcome = await undoExpense({ tenantId, requestId: current.requestId, actorName: current.actorName });
    if (outcome.status === "error") Alert.alert("Could not undo", outcome.message);
    else await invalidate();
    onCommitted?.();
  };

  const availableLine =
    mode.kind === "drawer" && mode.availableCents !== null
      ? `Drawer should hold ${formatPeso(Math.max(0, mode.availableCents))}`
      : null;
  const showStock = asksStockQuestion(category, tracksStock);
  const amountText = keypadDisplay(form.keypad);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} transparent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md), paddingTop: Math.max(insets.top, spacing.md) }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
            <PaidFromPill
              lockedDrawerName={mode.kind === "drawer" ? mode.drawerName : null}
              paidFrom={form.paidFrom}
              isOpen={panel === "source"}
              onToggle={() => setPanel(panel === "source" ? null : "source")}
            />
          </View>

          {isShowingAll ? (
            <AllCategories
              categories={scope === "take_out" || isDrawer ? offered : categories}
              selectedId={form.categoryId}
              onPick={(picked) => {
                update(selectCategory(form, picked.id));
                setIsShowingAll(false);
              }}
              onBack={() => setIsShowingAll(false)}
            />
          ) : (
            <>
              <ScrollView style={styles.upper} contentContainerStyle={styles.upperBody} keyboardShouldPersistTaps="handled">
                {panel === "source" ? (
                  <PaidFromChoices
                    value={form.paidFrom}
                    onPick={(paidFrom) => {
                      update({ ...form, paidFrom });
                      setPanel(null);
                    }}
                  />
                ) : null}

                <View style={styles.amountRow} accessible accessibilityLabel={`Amount: ${spokenCents(cents)}`} accessibilityLiveRegion="polite">
                  <Text style={styles.peso}>₱</Text>
                  <Text style={[styles.amount, cents === 0 && styles.amountEmpty]} numberOfLines={1} adjustsFontSizeToFit>
                    {amountText.slice(1)}
                  </Text>
                </View>
                {availableLine ? <Text style={styles.hint}>{availableLine}</Text> : null}

                <RepeatRow suggestions={suggestions} onPick={(suggestion) => update(applyRepeat(form, suggestion))} />

                {isLoadingCategories && categories.length === 0 ? (
                  <Text style={styles.hint}>Loading categories…</Text>
                ) : categoriesError && categories.length === 0 ? (
                  <Text style={styles.error}>Categories could not be loaded. {categoriesError}</Text>
                ) : (
                  <CategoryGrid
                    ranked={ranked}
                    selectedId={form.categoryId}
                    onPick={(picked) => update(selectCategory(form, picked.id))}
                    onMore={() => setIsShowingAll(true)}
                  />
                )}

                {showStock ? (
                  <StockQuestion value={form.isStockPurchase} onAnswer={(answer) => update({ ...form, isStockPurchase: answer })} />
                ) : null}

                <FoldedRow
                  hasReceipt={receipt !== null}
                  note={form.note}
                  noteRequired={category?.needsNote === true}
                  dateLabel={dayLabel(form.spentOn)}
                  canPickDate={!isDrawer}
                  paidTo={form.paidToName}
                  open={panel === "source" ? null : panel}
                  onReceipt={pickReceipt}
                  onOpen={setPanel}
                />
                {panel === "note" ? (
                  <FoldInput
                    value={form.note}
                    onChange={(note) => update({ ...form, note })}
                    placeholder={category?.needsNote ? "What was it for? (needed)" : "What was it for?"}
                    maxLength={NOTE_MAX}
                    accessibilityLabel="Note"
                  />
                ) : null}
                {panel === "paidTo" ? (
                  <FoldInput
                    value={form.paidToName}
                    onChange={(paidToName) => update({ ...form, paidToName })}
                    placeholder="Who was paid — e.g. Aling Nena, Meralco"
                    maxLength={PAID_TO_MAX}
                    accessibilityLabel="Paid to"
                  />
                ) : null}
                {panel === "date" ? (
                  <DateChoices
                    dates={dateChoices(manilaToday())}
                    value={form.spentOn}
                    onPick={(spentOn) => {
                      update({ ...form, spentOn });
                      setPanel(null);
                    }}
                  />
                ) : null}
              </ScrollView>

              <View style={styles.lower}>
                {error ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}
                {panel === "note" || panel === "paidTo" ? null : (
                  <ExpenseKeypad onKey={onKey} keyHeight={keyHeight} isDisabled={isSaving} />
                )}
                <Button
                  label={saveLabel(cents, verb)}
                  onPress={() => void save()}
                  size="lg"
                  isLoading={isSaving}
                  disabled={!canTapSave(form) || isSaving}
                  accessibilityLabel={cents > 0 ? `${verb} ${spokenCents(cents)}` : verb}
                  testID="expense-save"
                />
              </View>
            </>
          )}

          {snack ? (
            <View style={[styles.snack, { bottom: Math.max(insets.bottom, spacing.md) + 64 }]} pointerEvents="box-none">
              <UndoBar
                key={snack.requestId}
                message={snack.message}
                durationMs={UNDO_WINDOW_MS}
                onUndo={() => void undo(snack)}
                onCommit={() => {
                  commit(snack.requestId);
                  setSnack((current) => (current?.requestId === snack.requestId ? null : current));
                }}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -spacing.sm },
  title: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  upper: { flex: 1 },
  upperBody: { gap: spacing.md, paddingBottom: spacing.sm },
  amountRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "flex-end", gap: 4, minHeight: 56 },
  peso: { fontSize: 28, fontWeight: "600", color: colors.textSecondary },
  amount: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  amountEmpty: { color: colors.textTertiary },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: "right", marginTop: -spacing.sm },
  error: { ...typography.caption, fontWeight: "700", color: colors.danger },
  lower: { gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.separator },
  snack: { position: "absolute", left: spacing.lg, right: spacing.lg, borderRadius: radius.lg },
});
