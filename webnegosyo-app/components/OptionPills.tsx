import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";

/**
 * Wrapping pill group for choosing filter options.
 *
 * Generic over the option value (unlike `PeriodSelector`, which is string-only)
 * because the product filters select numbers, `undefined` ("All"), and unions.
 * `isSelected` is passed in so the same group serves both single-select and
 * multi-select without duplicating the markup.
 *
 * Wraps rather than scrolling horizontally. These groups live inside the filter
 * sheet, where an option scrolled out of sight is an option the merchant will
 * not find, and a nested horizontal scroller inside a vertical one fights the
 * gesture. `mode` drives the accessibility role, which is how a screen-reader
 * user learns that channels are additive and everything else is exclusive.
 */
interface OptionPillsProps<T> {
  options: readonly { label: string; value: T }[];
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
  /** Prefix for the accessibility label, e.g. "Rank by". */
  accessibilityPrefix: string;
  mode?: "single" | "multi";
}

export function OptionPills<T>({
  options,
  isSelected,
  onSelect,
  accessibilityPrefix,
  mode = "single",
}: OptionPillsProps<T>) {
  return (
    <View style={styles.group}>
      {options.map((option) => {
        const selected = isSelected(option.value);
        return (
          <TouchableOpacity
            key={option.label}
            style={[styles.pill, selected && styles.pillActive]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            accessibilityRole={mode === "multi" ? "checkbox" : "radio"}
            accessibilityState={mode === "multi" ? { checked: selected } : { selected }}
            accessibilityLabel={`${accessibilityPrefix} ${option.label}`}
          >
            <Text style={[styles.pillText, selected && styles.pillTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Full ink when unselected: these pills sit on the cream sheet, where the
  // old secondary grey measured 3.1:1.
  pillText: { ...typography.caption, color: colors.textPrimary, fontWeight: "500" },
  pillTextActive: { color: colors.textOnDark, fontWeight: "600" },
});
