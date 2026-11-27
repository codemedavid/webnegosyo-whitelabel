import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { LoadingState } from "../../components/LoadingState";
import { BackHeader } from "../../components/BackHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { CategoryEditSheet, type CategoryEditActions } from "../../components/expenses/categories/CategoryEditSheet";
import { CategoryTile } from "../../components/expenses/CategoryTile";
import { QuietBanner } from "../../components/expenses/home/HomeBits";
import { GROUP_LABELS } from "../../lib/expenses/categories";
import { categoryLook } from "../../lib/expenses/category-look";
import {
  archivedCategories,
  categorySections,
  draftForEdit,
  draftForNew,
  moveWrites,
  moveability,
  withCategory,
  type CategoryDraft,
} from "../../lib/expenses/category-manage";
import { liveExpenseDb } from "../../lib/expenses/expense-client";
import { archiveCategory, saveCategory, setCategorySortOrder } from "../../lib/expenses/expense-service";
import type { ExpenseCategory, ExpenseGroup } from "../../lib/expenses/types";
import {
  useAllExpenseCategories,
  useCanManageCategories,
  useExpenseTenant,
  useInvalidateExpenseCategories,
} from "../../lib/expenses/use-expenses";
import { refreshWithMinSpinner } from "../../lib/query/pull-to-refresh";
import { colors, radius, spacing, typography } from "../../theme/colors";

/**
 * Expense categories (mirrors the web's Categories dialog): every group with
 * what it means for Profit, "+ Add" per group, tap a category to rename it,
 * change its group (when the database allows), move it, or archive it.
 * Archived ones fold at the bottom with Restore. Categories are never deleted.
 *
 * Reached from Expenses and the add sheet, so it checks access itself: only a
 * store-wide account with `expenses` may change categories (RLS refuses a
 * branch account with zero rows).
 */
export default function ExpenseCategoriesScreen() {
  const canManage = useCanManageCategories();
  return canManage ? <CategoriesBook /> : <LockedCategories />;
}

function LockedCategories() {
  return (
    <View style={styles.screen}>
      <BackHeader title="Expense categories" />
      <View style={styles.inset}>
        <EmptyState
          icon="lock"
          title="Categories are locked"
          message="Only the owner, or a store-wide account with Expenses, can change categories."
          inset
        />
      </View>
    </View>
  );
}

interface SheetState {
  draft: CategoryDraft;
}

function CategoriesBook() {
  const tenantId = useExpenseTenant();
  const all = useAllExpenseCategories();
  const invalidate = useInvalidateExpenseCategories();
  // Writes show at once in `local`, kept until a NEW server list arrives (a
  // failed re-read must not hide what was just saved).
  const [local, setLocal] = useState<{ base: readonly ExpenseCategory[]; list: ExpenseCategory[] } | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isShowingArchived, setIsShowingArchived] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const categories = local !== null && local.base === all.categories ? local.list : all.categories;
  const sections = useMemo(() => categorySections(categories), [categories]);
  const archived = useMemo(() => archivedCategories(categories), [categories]);

  const showList = (list: ExpenseCategory[]) => setLocal({ base: all.categories, list });
  const applied = (next: ExpenseCategory) => showList(withCategory(categories, next));
  const settle = () => {
    void invalidate();
  };

  const refresh = () => {
    void refreshWithMinSpinner([all.refetch], setIsRefreshing);
  };

  const openNew = (group: ExpenseGroup) => {
    setNotice(null);
    setSheet({ draft: draftForNew(categories, group) });
  };
  const openEdit = (category: ExpenseCategory) => {
    setNotice(null);
    setSheet({ draft: draftForEdit(category) });
  };

  const actionsFor = (draft: CategoryDraft): CategoryEditActions => {
    const save = async (next: CategoryDraft) => {
      if (!tenantId) throw new Error("No store selected.");
      // The position goes only with a new category or a group change: the
      // draft's copy is from when the sheet opened, so a rename after a move
      // must not send it (it would undo the move).
      const current = next.id ? categories.find((category) => category.id === next.id) : undefined;
      const isRegrouped = current === undefined || current.group !== next.group;
      const saved = await saveCategory(liveExpenseDb, tenantId, {
        id: next.id,
        name: next.name,
        group: next.group,
        needsNote: next.needsNote,
        sortOrder: isRegrouped ? next.sortOrder : undefined,
      });
      applied(saved);
      setSheet(null);
      setNotice(next.id ? `Saved ${saved.name}.` : `Added ${saved.name} to ${GROUP_LABELS[saved.group]}.`);
      settle();
    };
    if (!draft.id) return { save };
    const id = draft.id;
    return {
      save,
      move: async (direction) => {
        if (!tenantId) throw new Error("No store selected.");
        const writes = moveWrites(categories, id, direction);
        if (!writes) return;
        // Only positions are written (a rename made elsewhere meanwhile stays).
        // Every write lands before the list re-reads, so a half move shows as it is.
        const results = await Promise.allSettled(
          writes.map(({ category, sortOrder }) => setCategorySortOrder(liveExpenseDb, tenantId, category.id, sortOrder)),
        );
        let next = categories;
        for (const result of results) if (result.status === "fulfilled") next = withCategory(next, result.value);
        showList(next);
        settle();
        const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failed) throw failed.reason;
      },
      archive: async () => {
        if (!tenantId) throw new Error("No store selected.");
        const saved = await archiveCategory(liveExpenseDb, tenantId, id, true);
        applied(saved);
        setSheet(null);
        setNotice(`${saved.name} archived. Old expenses keep it.`);
        settle();
      },
    };
  };

  const restore = async (category: ExpenseCategory) => {
    if (!tenantId || restoringId) return;
    setRestoringId(category.id);
    setNotice(null);
    try {
      const saved = await archiveCategory(liveExpenseDb, tenantId, category.id, false);
      applied(saved);
      setNotice(`${saved.name} is back.`);
      settle();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not restore it. Try again.");
    } finally {
      setRestoringId(null);
    }
  };

  const header = <BackHeader title="Expense categories" subtitle="The group decides where each one lands in Profit." />;

  let body: React.ReactNode;
  if (all.data === undefined && all.error) {
    body = <ErrorState title="Categories could not load" message={all.error} onRetry={() => void all.refetch()} />;
  } else if (all.data === undefined) {
    body = <LoadingState message="Opening your categories..." />;
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {all.error ? <QuietBanner message="Could not refresh. Showing what was loaded before." onRetry={() => void all.refetch()} /> : null}
        {notice ? (
          <Text style={styles.notice} accessibilityLiveRegion="polite" testID="categories-notice">
            {notice}
          </Text>
        ) : null}
        {sections.map((section) => (
          <View key={section.group} style={styles.section}>
            <SectionHeader
              title={section.label}
              hint={section.hint}
              actionLabel="Add"
              onAction={() => openNew(section.group)}
            />
            <View style={styles.card}>
              {section.items.length === 0 ? (
                <Text style={styles.none}>None yet.</Text>
              ) : (
                section.items.map((category, index) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.row, index < section.items.length - 1 && styles.rowDivider]}
                    onPress={() => openEdit(category)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${category.name}`}
                    testID={`category-manage-${category.id}`}
                  >
                    <CategoryTile look={categoryLook(category)} size={30} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {category.name}
                      </Text>
                      {category.needsNote ? <Text style={styles.rowHint}>Needs a note</Text> : null}
                    </View>
                    <Icon name="chevron" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        ))}

        {archived.length > 0 ? (
          <View style={styles.section}>
            <Button
              label={`${isShowingArchived ? "Hide" : "Show"} archived (${archived.length})`}
              tone="ghost"
              size="md"
              onPress={() => setIsShowingArchived((shown) => !shown)}
              testID="categories-toggle-archived"
            />
            {isShowingArchived ? (
              <View style={styles.card}>
                {archived.map((category, index) => (
                  <View key={category.id} style={[styles.row, index < archived.length - 1 && styles.rowDivider]}>
                    <CategoryTile look={categoryLook(category)} size={30} isMuted />
                    <Text style={[styles.rowName, styles.rowMuted]} numberOfLines={1}>
                      {category.name} · {GROUP_LABELS[category.group]}
                    </Text>
                    <Button
                      label="Restore"
                      tone="secondary"
                      size="sm"
                      isLoading={restoringId === category.id}
                      disabled={restoringId !== null}
                      onPress={() => void restore(category)}
                      accessibilityLabel={`Restore ${category.name}`}
                      testID={`category-restore-${category.id}`}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  const editing = sheet?.draft ?? null;
  const moves = editing?.id ? moveability(categories, editing.id) : { up: false, down: false };

  return (
    <View style={styles.screen}>
      {header}
      {body}
      {editing ? (
        <CategoryEditSheet
          key={editing.id ?? `new-${editing.group}`}
          draft={editing}
          categories={categories}
          canMoveUp={moves.up}
          canMoveDown={moves.down}
          actions={actionsFor(editing)}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inset: { paddingHorizontal: spacing.xl },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 120, gap: spacing.xl },
  notice: {
    ...typography.caption,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  section: { gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  none: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, color: colors.textPrimary },
  rowName: { ...typography.body, flex: 1, color: colors.textPrimary },
  rowMuted: { color: colors.textMuted },
  rowHint: { ...typography.small, color: colors.textMuted },
});
