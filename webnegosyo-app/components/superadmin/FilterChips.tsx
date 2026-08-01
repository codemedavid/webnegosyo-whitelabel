import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";

export interface ChipOption<T extends string> {
  key: T;
  label: string;
  /** Optional trailing count, rendered in a contrasting bubble. */
  count?: number;
}

interface FilterChipsProps<T extends string> {
  options: readonly ChipOption<T>[];
  selected: T | undefined;
  onSelect: (key: T) => void;
  /** Small label above the row, e.g. "Status". */
  caption?: string;
}

/**
 * Horizontally scrolling filter row.
 *
 * Extracted because the restaurants screen renders two of these and the leads
 * screen a third; they had drifted into three near-identical copies of the
 * same styles.
 */
export function FilterChips<T extends string>({
  options,
  selected,
  onSelect,
  caption,
}: FilterChipsProps<T>) {
  return (
    <View style={styles.wrapper}>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((option) => {
          const isActive = selected === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onSelect(option.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {option.label}
              </Text>
              {option.count !== undefined ? (
                <View style={[styles.count, isActive && styles.countActive]}>
                  <Text
                    style={[styles.countText, isActive && styles.countTextActive]}
                  >
                    {option.count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  caption: { ...typography.eyebrow, color: colors.textTertiary },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  chipTextActive: { color: colors.textOnDark },
  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
  },
  countActive: { backgroundColor: "rgba(255,255,255,0.18)" },
  countText: { ...typography.small, color: colors.textSecondary, fontWeight: "800" },
  countTextActive: { color: colors.textOnDark },
});
