import React, { useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../lib/demo";
import { readActorName } from "../../lib/expenses/actor-name";
import { NOTE_MAX } from "../../lib/expenses/add-expense-form";
import { rankCategoriesForPicker } from "../../lib/expenses/categories";
import { liveExpenseDb } from "../../lib/expenses/expense-client";
import { dayLabel, formatCents, manilaClock, manilaDate } from "../../lib/expenses/expense-format";
import { sortDrawerPayout } from "../../lib/expenses/expense-service";
import { suggestCategoryForReason } from "../../lib/expenses/sort-suggest";
import type { Expense, ExpenseCategory, UnsortedPayout } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";
import { Icon } from "../Icon";
import { AllCategories, CategoryGrid, Chip, FoldInput } from "./AddExpenseParts";

interface SortPayoutsSheetProps {
  payouts: readonly UnsortedPayout[];
  categories: readonly ExpenseCategory[];
  recent: readonly Expense[];
  onClose: () => void;
  /** After one was sorted: the list and the banner re-read. */
  onSorted: () => void;
}

function shortName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "");
}

/**
 * Old drawer pay-outs (from builds before expenses) waiting for a category
 * (plan §5.2). One tap opens a pay-out with its amount locked and a keyword
 * guess ("yelo" → Ice); Save links it with `sort_drawer_payout`, which inserts
 * one expense and changes nothing that already exists.
 */
export function SortPayoutsSheet({ payouts, categories, recent, onClose, onSorted }: SortPayoutsSheetProps) {
  const [selected, setSelected] = useState<UnsortedPayout | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const ranked = useMemo(() => rankCategoriesForPicker(categories, recent, new Date()), [categories, recent]);
  const suggestion = selected ? suggestCategoryForReason(selected.reason, categories) : null;
  const suggested = suggestion ? categories.find((category) => category.id === suggestion.categoryId) ?? null : null;
  const category = categories.find((c) => c.id === categoryId) ?? null;

  const open = (payout: UnsortedPayout) => {
    const guess = suggestCategoryForReason(payout.reason, categories);
    setSelected(payout);
    // A confident guess is pre-picked; a weak one is only offered.
    setCategoryId(guess?.confidence === "high" ? guess.categoryId : null);
    setNote(payout.reason);
    setError(null);
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
      setSelected(null);
      onSorted();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We couldn't save that. Please try again.");
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  };

  if (selected) {
    return (
      <DrawerSheet
        visible
        title={`Sort ${formatCents(selected.amountCents, { compact: true })}`}
        subtitle={`${selected.recordedByName} · ${dayLabel(manilaDate(Date.parse(selected.createdAt)))}, ${manilaClock(selected.createdAt)}`}
        onClose={() => setSelected(null)}
        closeLabel="Back"
        isBusy={isSaving}
      >
        {isShowingAll ? (
          <View style={styles.all}>
            <AllCategories
              categories={categories}
              selectedId={categoryId}
              onPick={(picked) => {
                setCategoryId(picked.id);
                setIsShowingAll(false);
              }}
              onBack={() => setIsShowingAll(false)}
            />
          </View>
        ) : (
          <>
            {selected.reason ? <Text style={styles.reason}>“{selected.reason}”</Text> : null}
            {suggested && suggested.id !== categoryId ? (
              <View style={styles.suggestion}>
                <Text style={styles.suggestionText}>Looks like</Text>
                <Chip label={shortName(suggested.name)} icon="check" onPress={() => setCategoryId(suggested.id)} />
              </View>
            ) : null}
            <CategoryGrid
              ranked={ranked}
              selectedId={categoryId}
              onPick={(picked) => {
                setCategoryId(picked.id);
                setError(null);
              }}
              onMore={() => setIsShowingAll(true)}
            />
            <FoldInput
              value={note}
              onChange={(text) => {
                setNote(text);
                setError(null);
              }}
              placeholder={category?.needsNote ? "What was it for? (needed)" : "Note (optional)"}
              maxLength={NOTE_MAX}
              accessibilityLabel="Note"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={category ? `Save as ${shortName(category.name)}` : "Pick a category"}
              onPress={() => void save()}
              size="lg"
              isLoading={isSaving}
              disabled={!category || isSaving}
            />
          </>
        )}
      </DrawerSheet>
    );
  }

  return (
    <DrawerSheet
      visible
      title={`${payouts.length} drawer ${payouts.length === 1 ? "pay-out" : "pay-outs"} to sort`}
      subtitle="Paid out before expenses existed. Give each one its category so it counts in Profit."
      onClose={onClose}
      closeLabel="Done"
    >
      {payouts.length === 0 ? <Text style={styles.reason}>All sorted.</Text> : null}
      {payouts.map((payout) => {
        const guess = suggestCategoryForReason(payout.reason, categories);
        const guessName = guess ? categories.find((c) => c.id === guess.categoryId)?.name : null;
        return (
          <TouchableOpacity
            key={payout.movementId}
            style={styles.payout}
            onPress={() => open(payout)}
            accessibilityRole="button"
            accessibilityLabel={`Sort ${formatCents(payout.amountCents)}: ${payout.reason || "no reason given"}`}
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
            <Text style={styles.payoutAmount}>−{formatCents(payout.amountCents, { compact: true })}</Text>
            <Icon name="chevron" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        );
      })}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  all: { height: 420 },
  reason: { ...typography.body, color: colors.textSecondary, fontStyle: "italic" },
  suggestion: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  suggestionText: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, fontWeight: "700", color: colors.danger },
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
