import React from "react";
import { Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";

/**
 * Horizontal pill row for choosing filter options.
 *
 * Generic over the option value (unlike `PeriodSelector`, which is string-only)
 * because the product filters select numbers, `undefined` ("All"), and unions.
 * `isSelected` is passed in so the same row serves both single-select and
 * multi-select (source channels) without duplicating the markup.
 */
interface OptionPillsProps<T> {
  options: readonly { label: string; value: T }[];
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
  /** Prefix for the accessibility label, e.g. "Rank by". */
  accessibilityPrefix: string;
}

export function OptionPills<T>({
  options,
  isSelected,
  onSelect,
  accessibilityPrefix,
}: OptionPillsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {options.map((option) => {
        const selected = isSelected(option.value);
        return (
          <TouchableOpacity
            key={option.label}
            style={[styles.pill, selected && styles.pillActive]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${accessibilityPrefix} ${option.label}`}
          >
            <Text style={[styles.pillText, selected && styles.pillTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingBottom: spacing.sm },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  pillTextActive: { color: colors.textOnDark },
});
