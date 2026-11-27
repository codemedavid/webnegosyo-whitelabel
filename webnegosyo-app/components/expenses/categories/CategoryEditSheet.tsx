import React, { useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { GROUP_LABELS } from "../../../lib/expenses/categories";
import {
  GROUP_HINTS,
  MAX_CATEGORY_NAME_LENGTH,
  canChangeGroup,
  draftProblem,
  isUnchanged,
  lockHint,
  nextSortOrder,
  type CategoryDraft,
} from "../../../lib/expenses/category-manage";
import { EXPENSE_GROUPS, type ExpenseCategory, type ExpenseGroup } from "../../../lib/expenses/types";
import { colors, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { DrawerSheet, sheetText } from "../../drawer/DrawerSheet";
import { ChoicePill, PillRow, TextField } from "../detail/SheetParts";

export interface CategoryEditActions {
  save: (draft: CategoryDraft) => Promise<void>;
  move?: (direction: -1 | 1) => Promise<void>;
  archive?: () => Promise<void>;
}

interface CategoryEditSheetProps {
  draft: CategoryDraft;
  /** Every category (archived included), for the name check. */
  categories: readonly ExpenseCategory[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  actions: CategoryEditActions;
  onClose: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Could not save that. Try again.";
}

/**
 * Add or change one expense category: its name, the group it counts as in
 * Profit, and whether it needs a note. A saved one can also move within its
 * group or be archived (never deleted: old expenses keep it). The database's
 * locks are said here before Save: a starter keeps its group and note rule,
 * a used category keeps its group (the refusal comes back in words).
 */
export function CategoryEditSheet({ draft: initial, categories, canMoveUp, canMoveDown, actions, onClose }: CategoryEditSheetProps) {
  const [draft, setDraft] = useState<CategoryDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const inFlight = useRef(false);
  const isNew = !draft.id;
  const isGroupLocked = !canChangeGroup(draft);
  const hint = lockHint(draft);

  const edit = (next: Partial<CategoryDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  };

  /** One write at a time: a double tap must never add the category twice. */
  const runOnce = async (write: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsBusy(true);
    try {
      await write();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  };

  const submit = () => {
    const problem = draftProblem(draft, categories);
    if (problem) return setError(problem);
    if (isUnchanged(draft, categories)) return onClose();
    void runOnce(() => actions.save({ ...draft, name: draft.name.trim() }));
  };

  // Moving to another group puts it at the END of that group (like a new one).
  // Within its own group the position is never sent on Save (the screen drops
  // it), so a rename after Move up/down keeps the move.
  const pickGroup = (group: ExpenseGroup) => {
    if (isGroupLocked) return;
    const sortOrder = group === initial.group ? initial.sortOrder : nextSortOrder(categories, group);
    edit({ group, sortOrder });
  };

  return (
    <DrawerSheet
      visible
      title={isNew ? `New ${GROUP_LABELS[draft.group]} category` : "Edit category"}
      subtitle={isNew ? "Name it in your own words." : "Old expenses keep this category, whatever you change."}
      onClose={onClose}
      isBusy={isBusy}
    >
      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextField
          value={draft.name}
          onChange={(name) => edit({ name })}
          placeholder="e.g. Charcoal (Uling)"
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          accessibilityLabel="Category name"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Counts as</Text>
        {isGroupLocked ? (
          <Text style={styles.value}>
            {GROUP_LABELS[draft.group]} · {GROUP_HINTS[draft.group]}
          </Text>
        ) : (
          <PillRow>
            {EXPENSE_GROUPS.map((group) => (
              <ChoicePill
                key={group}
                label={GROUP_LABELS[group]}
                isOn={draft.group === group}
                onPress={() => pickGroup(group)}
                testID={`category-group-${group}`}
              />
            ))}
          </PillRow>
        )}
        {!isGroupLocked ? <Text style={styles.hint}>{GROUP_HINTS[draft.group]}</Text> : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.label}>Needs a note</Text>
          <Text style={styles.hint}>Asks what it was for, every time.</Text>
        </View>
        <Switch
          value={draft.needsNote}
          disabled={draft.isStarter || isBusy}
          onValueChange={(needsNote) => edit({ needsNote })}
          accessibilityLabel="Needs a note"
          testID="category-needs-note"
        />
      </View>

      {error ? (
        <Text style={sheetText.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        label={isNew ? "Add category" : "Save"}
        size="lg"
        onPress={submit}
        isLoading={isBusy}
        disabled={isBusy}
        testID="category-save"
      />

      {!isNew && (actions.move || actions.archive) ? (
        <View style={styles.secondary}>
          {actions.move ? (
            <View style={styles.moveRow}>
              <Button
                label="Move up"
                icon="arrow-up"
                tone="secondary"
                size="md"
                fullWidth={false}
                style={styles.moveButton}
                disabled={isBusy || !canMoveUp}
                onPress={() => void runOnce(() => actions.move!(-1))}
                testID="category-move-up"
              />
              <Button
                label="Move down"
                icon="arrow-down"
                tone="secondary"
                size="md"
                fullWidth={false}
                style={styles.moveButton}
                disabled={isBusy || !canMoveDown}
                onPress={() => void runOnce(() => actions.move!(1))}
                testID="category-move-down"
              />
            </View>
          ) : null}
          {actions.archive ? (
            <Button
              label="Archive category"
              tone="ghost"
              size="md"
              disabled={isBusy}
              onPress={() => void runOnce(actions.archive!)}
              accessibilityHint="It leaves the picker. Old expenses keep it, and you can restore it."
              testID="category-archive"
            />
          ) : null}
        </View>
      ) : null}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  value: { ...typography.body, color: colors.textPrimary },
  hint: { ...typography.small, color: colors.textMuted },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchText: { flex: 1, gap: 2 },
  secondary: { gap: spacing.sm },
  moveRow: { flexDirection: "row", gap: spacing.sm },
  moveButton: { flex: 1 },
});
