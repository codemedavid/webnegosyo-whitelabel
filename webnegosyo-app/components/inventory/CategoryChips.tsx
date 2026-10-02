import React from "react";
import { ScrollView, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius } from "../../theme/colors";
import type { CategoryChip } from "../../lib/inventory-insights";

interface CategoryChipsProps {
  chips: readonly CategoryChip[];
  /** Null = every category. */
  selected: string | null;
  total: number;
  onSelect: (key: string | null) => void;
}

/**
 * The merchant's own shelves — Dairy, Dry goods — as one scrolling row.
 * Renders nothing when there is only one category, since a lone chip filters
 * nothing (`categoryChips` returns an empty list then).
 */
export function CategoryChips({ chips, selected, total, onSelect }: CategoryChipsProps) {
  if (chips.length === 0) return null;

  const all = [{ key: null as string | null, label: "All", count: total }, ...chips];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroller}
    >
      {all.map((chip) => {
        const isActive = selected === chip.key;
        return (
          <TouchableOpacity
            key={chip.key ?? "__all__"}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelect(isActive && chip.key !== null ? null : chip.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{chip.label}</Text>
            <Text style={[styles.count, isActive && styles.countActive]}>{chip.count}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Bleeds to the screen edge so the row visibly scrolls rather than clipping.
  scroller: { marginHorizontal: -spacing.lg },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.heroInk, borderColor: colors.heroInk },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  labelActive: { color: colors.heroInkText },
  count: { fontSize: 12, fontWeight: "700", color: colors.textTertiary },
  countActive: { color: colors.tabBarActive },
});
