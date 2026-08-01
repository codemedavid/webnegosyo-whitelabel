import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";
import type { ProductFilterChip } from "../lib/product-filter-summary";

/**
 * A small drawn cross, not a "×" character.
 *
 * The app has no icon library and labels its controls in words; this is the one
 * place a word does not fit, so the mark is authored from two 1.5pt strokes at
 * the same weight rather than borrowed from a font.
 */
function RemoveMark({ tint }: { tint: string }) {
  return (
    <View style={markStyles.box}>
      <View style={[markStyles.stroke, markStyles.forward, { backgroundColor: tint }]} />
      <View style={[markStyles.stroke, markStyles.back, { backgroundColor: tint }]} />
    </View>
  );
}

interface FilterChipsRowProps {
  chips: readonly ProductFilterChip[];
  onRemove: (chip: ProductFilterChip) => void;
  onClearAll: () => void;
}

/**
 * What is currently narrowing the numbers, and the handle to undo each one.
 *
 * Wrapped rather than horizontally scrolled: a chip that has scrolled out of
 * sight is a filter the merchant has stopped accounting for, which is the exact
 * failure this row exists to prevent.
 */
export function FilterChipsRow({ chips, onRemove, onClearAll }: FilterChipsRowProps) {
  if (chips.length === 0) return null;

  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <TouchableOpacity
          key={chip.id}
          style={styles.chip}
          onPress={() => onRemove(chip)}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${chip.label}`}
        >
          <Text style={styles.chipLabel}>{chip.label}</Text>
          <RemoveMark tint={colors.textSecondary} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.clearAll}
        onPress={onClearAll}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Clear all filters"
      >
        <Text style={styles.clearAllText}>Clear all</Text>
      </TouchableOpacity>
    </View>
  );
}

const markStyles = StyleSheet.create({
  box: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  stroke: { position: "absolute", width: 11, height: 1.5, borderRadius: 1 },
  forward: { transform: [{ rotate: "45deg" }] },
  back: { transform: [{ rotate: "-45deg" }] },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  chipLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  clearAll: { height: 32, justifyContent: "center", paddingHorizontal: spacing.sm },
  // Ink, not the coral accent: accent on the cream canvas measures 3.1:1, and
  // this is 13pt. Weight carries the emphasis instead.
  clearAllText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
