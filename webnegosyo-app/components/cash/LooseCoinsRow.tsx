import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatCents, spokenCents } from "../../lib/expenses/expense-format";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface LooseCoinsRowProps {
  cents: number;
  /** What the keypad is showing while this row is focused ("₱45.7"). */
  typing: string | null;
  isFocused: boolean;
  isDisabled?: boolean;
  onFocus: () => void;
}

/**
 * "Coins I counted by total ₱___" — for cashiers who weigh or roll coins. The
 * keypad types an amount here (amount mode), not a piece count.
 */
export function LooseCoinsRow({ cents, typing, isFocused, isDisabled = false, onFocus }: LooseCoinsRowProps) {
  const shown = isFocused && typing !== null ? typing : cents > 0 ? formatCents(cents) : "₱___";
  return (
    <Pressable
      onPress={onFocus}
      disabled={isDisabled}
      style={[styles.row, isFocused && styles.focused]}
      accessibilityRole="button"
      accessibilityLabel={`Coins I counted by total, ${cents > 0 ? spokenCents(cents) : "none yet"}`}
      accessibilityHint="Type the amount on the keypad"
      accessibilityState={{ selected: isFocused, disabled: isDisabled }}
      testID="denomination-loose"
    >
      <Text style={styles.label}>Coins I counted by total</Text>
      <View style={styles.valueWrap}>
        <Text style={[styles.value, cents === 0 && !isFocused && styles.empty]}>{shown}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  focused: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  label: { ...typography.body, flex: 1, fontWeight: "600", color: colors.textPrimary },
  valueWrap: { minWidth: 96, alignItems: "flex-end" },
  value: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  empty: { color: colors.textTertiary },
});
