import React, { useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { readActorName } from "../../lib/expenses/actor-name";
import { NOTE_MAX } from "../../lib/expenses/add-expense-form";
import { rankCategoriesForPicker } from "../../lib/expenses/categories";
import { categoryLook } from "../../lib/expenses/category-look";
import { liveExpenseDb } from "../../lib/expenses/expense-client";
import { isAlreadySortedError, payoutSuggestion, shortName } from "../../lib/expenses/expense-detail-sheets";
import { dayLabel, formatCents, manilaClock, manilaDate } from "../../lib/expenses/expense-format";
import { sortDrawerPayout } from "../../lib/expenses/expense-service";
import { suggestCategoryForReason } from "../../lib/expenses/sort-suggest";
import type { Expense, ExpenseCategory, UnsortedPayout } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet, sheetText } from "../drawer/DrawerSheet";
import { Icon } from "../Icon";
import { CategoryGrid, CategoryList } from "./CategoryPicker";
import { CategoryTile } from "./CategoryTile";
import { TextField } from "./detail/SheetParts";

interface SortPayoutsSheetProps {
  payouts: readonly UnsortedPayout[];
  categories: readonly ExpenseCategory[];
  recent: readonly Expense[];
  onClose: () => void;
  /** After one was sorted: the list and the banner re-read. */
  onSorted: () => void;
}

type Step = "list" | "item" | "categories";

function whenOf(payout: UnsortedPayout): string {
  return `${dayLabel(manilaDate(Date.parse(payout.createdAt)))} · ${manilaClock(payout.createdAt)}`;
}

function PayoutRow({ payout, categories, onOpen }: { payout: UnsortedPayout; categories: readonly ExpenseCategory[]; onOpen: () => void }) {
  const guess = suggestCategoryForReason(payout.reason, categories);
  const guessName = guess ? categories.find((category) => category.id === guess.categoryId)?.name : null;
  return (
    <TouchableOpacity
      style={styles.payout}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Give a category to ${formatCents(payout.amountCents)}: ${payout.reason || "no reason given"}`}
    >
      <View style={styles.payoutBody}>
        <Text style={styles.payoutTitle} numberOfLines={1}>
          {payout.reason || "No reason given"}
        </Text>
        <Text style={styles.payoutMeta} numberOfLines={1}>
          {payout.recordedByName} · {dayLabel(manilaDate(Date.parse(payout.createdAt)))}
          {guessName ? ` · looks like ${shortName(guessName)}` : ""}
        </Text>
      </View>
      <Text style={styles.payoutAmount}>{formatCents(payout.amountCents, { compact: true })}</Text>
      <Icon name="chevron" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const ALREADY_SORTED = "That pay-out already had a category.";

/**
 * Old drawer pay-outs (from builds before expenses) waiting for a category.
 * ONE sheet whose body steps in place: the list, then one pay-out (amount
 * locked, a "Looks like Ice" guess), then every category if needed. Save links
 * it with `sort_drawer_payout`, which inserts one expense and changes nothing
 * that already exists. A saved pay-out leaves the list at once (it can't be
 * sorted twice before the re-read), and "Back" — the header button and
 * Android's — steps back one level; only the list's "Done" closes.
 */
export function SortPayoutsSheet({ payouts, categories, recent, onClose, onSorted }: SortPayoutsSheetProps) {
  const [step, setStep] = useState<Step>("list");
  const [selected, setSelected] = useState<UnsortedPayout | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortedIds, setSortedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);

  const waiting = useMemo(() => payouts.filter((payout) => !sortedIds.has(payout.movementId)), [payouts, sortedIds]);
  const ranked = useMemo(() => rankCategoriesForPicker(categories, recent, new Date()), [categories, recent]);
  const category = categories.find((candidate) => candidate.id === categoryId) ?? null;
  const suggested = selected ? payoutSuggestion(selected.reason, categories, categoryId) : null;

  const open = (payout: UnsortedPayout) => {
    const guess = suggestCategoryForReason(payout.reason, categories);
    setSelected(payout);
    // A confident guess is pre-picked; a weak one is only offered.
    setCategoryId(guess?.confidence === "high" ? guess.categoryId : null);
    setNote(payout.reason);
    setError(null);
    setNotice(null);
    setStep("item");
  };
  const pick = (picked: ExpenseCategory) => {
    setCategoryId(picked.id);
    setError(null);
    setStep("item");
  };
  const backToList = () => {
    setSelected(null);
    setStep("list");
  };
  const markSorted = (payout: UnsortedPayout, message: string) => {
    setSortedIds((current) => new Set([...current, payout.movementId]));
    setNotice(message);
    backToList();
    onSorted();
  };

  const save = async () => {
    if (!selected || !category || inFlight.current) return;
    if (useAuthStore.getState().isDemo) {
      Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
      return;
    }
    if (category.needsNote && !note.trim()) {
      setError("Add a note for this category.");
      return;
    }
    inFlight.current = true;
    setIsSaving(true);
    try {
      await sortDrawerPayout(liveExpenseDb, {
        movementId: selected.movementId,
        categoryId: category.id,
        note: note.trim() || null,
        recordedByName: await readActorName(),
      });
      markSorted(selected, `Saved ${formatCents(selected.amountCents, { compact: true })} as ${shortName(category.name)}.`);
    } catch (saveError) {
      if (isAlreadySortedError(saveError)) {
        markSorted(selected, ALREADY_SORTED);
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "We couldn't save that. Please try again.");
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  };

  if (step === "categories" && selected) {
    return (
      <DrawerSheet visible title="Pick a category" onClose={() => setStep("item")} closeLabel="Back" isBusy={isSaving}>
        <CategoryList categories={categories} selectedId={categoryId} onPick={pick} />
      </DrawerSheet>
    );
  }

  if (step === "item" && selected) {
    return (
      <DrawerSheet
        visible
        title={`${formatCents(selected.amountCents, { compact: true })} from the drawer`}
        subtitle={`${selected.recordedByName} · ${whenOf(selected)}`}
        onClose={backToList}
        closeLabel="Back"
        isBusy={isSaving}
      >
        {selected.reason ? <Text style={styles.reason}>“{selected.reason}”</Text> : null}
        {suggested ? (
          <TouchableOpacity
            style={styles.suggestion}
            onPress={() => pick(suggested)}
            accessibilityRole="button"
            accessibilityLabel={`Looks like ${suggested.name}. Use it.`}
            testID="sort-suggestion"
          >
            <CategoryTile look={categoryLook(suggested)} size={26} />
            <Text style={styles.suggestionText}>Looks like {shortName(suggested.name)}</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={sheetText.label}>Category</Text>
        <CategoryGrid ranked={ranked} selectedId={categoryId} onPick={pick} onShowAll={() => setStep("categories")} />
        <Text style={sheetText.label}>Note</Text>
        <TextField
          value={note}
          onChange={(text) => {
            setNote(text);
            setError(null);
          }}
          placeholder={category?.needsNote ? "What was it for? (needed)" : "Note (optional)"}
          maxLength={NOTE_MAX}
          accessibilityLabel="Note"
        />
        {error ? <Text style={sheetText.error}>{error}</Text> : null}
        <Button
          label={category ? `Save as ${shortName(category.name)}` : "Pick a category"}
          onPress={() => void save()}
          size="lg"
          isLoading={isSaving}
          disabled={!category || isSaving}
          testID="sort-save"
        />
      </DrawerSheet>
    );
  }

  return (
    <DrawerSheet
      visible
      title="Give these a category"
      subtitle="Paid from the drawer before expenses existed. Give each one a category so it counts in Profit."
      onClose={onClose}
      closeLabel="Done"
    >
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Icon name="check" size={16} color={colors.success} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      {waiting.length === 0 ? <Text style={styles.reason}>All done. Every pay-out has a category.</Text> : null}
      {waiting.map((payout) => (
        <PayoutRow key={payout.movementId} payout={payout} categories={categories} onOpen={() => open(payout)} />
      ))}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  reason: { ...typography.body, color: colors.textSecondary, fontStyle: "italic" },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successLight,
  },
  noticeText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    minHeight: 44,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  suggestionText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  payout: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  payoutBody: { flex: 1, gap: 2 },
  payoutTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  payoutMeta: { ...typography.caption, color: colors.textMuted },
  payoutAmount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
