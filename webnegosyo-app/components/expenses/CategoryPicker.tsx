import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { GROUP_LABELS, sortCategories } from "../../lib/expenses/categories";
import { categoryLook, shortCategoryName } from "../../lib/expenses/category-look";
import { EXPENSE_GROUPS, type ExpenseCategory, type ExpenseGroup } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { CategoryTile } from "./CategoryTile";

/**
 * Group headings in the list. The shared engine's labels (`GROUP_LABELS`,
 * byte-identical with the web) say "Not an expense"; the app says "Cash moved"
 * everywhere (rows, hero, split), so the picker does too.
 */
const LIST_GROUP_LABELS: Readonly<Record<ExpenseGroup, string>> = { ...GROUP_LABELS, not_expense: "Cash moved" };

/** Cells in the grid before "All N": two rows of four. */
export const GRID_CELLS = 8;

interface CategoryGridProps {
  /** Already in picker order (`rankCategoriesForPicker`). */
  ranked: readonly ExpenseCategory[];
  selectedId: string | null;
  onPick: (category: ExpenseCategory) => void;
  /** Shows every category in place of the grid (never another sheet on top). */
  onShowAll: () => void;
  /** Total offered, for the "All 27" cell. Defaults to `ranked.length`. */
  totalCount?: number;
}

/**
 * The add grid: the store's most-used categories as icon tiles, the chosen one
 * always on screen, then "All N". Coral ring = chosen (POS selection idiom).
 */
export function CategoryGrid({ ranked, selectedId, onPick, onShowAll, totalCount }: CategoryGridProps) {
  const top = ranked.slice(0, GRID_CELLS - 1);
  const selected = selectedId ? ranked.find((category) => category.id === selectedId) : undefined;
  const cells = selected && !top.includes(selected) ? [...top.slice(0, GRID_CELLS - 2), selected] : top;
  const count = totalCount ?? ranked.length;
  return (
    <View style={styles.grid}>
      {cells.map((category) => {
        const isOn = category.id === selectedId;
        return (
          <TouchableOpacity
            key={category.id}
            style={[styles.cell, isOn && styles.cellOn]}
            onPress={() => onPick(category)}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            accessibilityLabel={category.name}
            testID={`category-${category.id}`}
          >
            <CategoryTile look={categoryLook(category)} size={34} />
            <Text style={[styles.cellLabel, isOn && styles.cellLabelOn]} numberOfLines={2}>
              {shortCategoryName(category.name)}
            </Text>
          </TouchableOpacity>
        );
      })}
      {count > cells.length ? (
        <TouchableOpacity
          style={styles.cell}
          onPress={onShowAll}
          accessibilityRole="button"
          accessibilityLabel={`All ${count} categories`}
          testID="category-all"
        >
          <View style={styles.allTile}>
            <Icon name="grid" size={17} color={colors.textPrimary} />
          </View>
          <Text style={styles.cellLabel} numberOfLines={1}>
            All {count}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface CategoryListProps {
  categories: readonly ExpenseCategory[];
  selectedId: string | null;
  onPick: (category: ExpenseCategory) => void;
}

/**
 * Every active category, grouped the way the owner reads them ("Rent", not
 * "Occupancy"). Plain rows — the caller puts it in its own scroll view.
 */
export function CategoryList({ categories, selectedId, onPick }: CategoryListProps) {
  const sections = EXPENSE_GROUPS.map((group) => ({
    group,
    items: sortCategories(categories.filter((category) => category.group === group && category.archivedAt === null)),
  })).filter((section) => section.items.length > 0);
  return (
    <View style={styles.list}>
      {sections.map((section) => (
        <View key={section.group} style={styles.section}>
          <Text style={styles.sectionTitle}>{LIST_GROUP_LABELS[section.group]}</Text>
          {section.items.map((category) => {
            const isOn = category.id === selectedId;
            return (
              <TouchableOpacity
                key={category.id}
                style={[styles.row, isOn && styles.rowOn]}
                onPress={() => onPick(category)}
                accessibilityRole="button"
                accessibilityState={{ selected: isOn }}
                accessibilityLabel={category.name}
                testID={`category-row-${category.id}`}
              >
                <CategoryTile look={categoryLook(category)} size={30} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {category.name}
                </Text>
                {isOn ? <Icon name="check" size={18} color={colors.accent} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs },
  cell: {
    width: "25%",
    alignItems: "center",
    gap: 5,
    paddingTop: spacing.sm,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderRadius: radius.md,
  },
  cellOn: { backgroundColor: colors.accentLight, borderWidth: 1.5, borderColor: colors.accent },
  cellLabel: { ...typography.small, fontWeight: "600", color: colors.textPrimary, textAlign: "center", lineHeight: 13 },
  cellLabelOn: { color: colors.textPrimary, fontWeight: "700" },
  allTile: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { gap: spacing.lg },
  section: { gap: 2 },
  sectionTitle: { ...typography.eyebrow, color: colors.textMuted, marginBottom: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowOn: { backgroundColor: colors.accentLight },
  rowName: { ...typography.body, flex: 1, color: colors.textPrimary },
});
