import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";

interface RuleChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}

/** One pill choice, 48pt tall: ink when chosen, white with a hairline otherwise. */
export function RuleChip({ label, isSelected, onPress, accessibilityLabel, disabled = false }: RuleChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, isSelected && styles.chipOn, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.label, isSelected && styles.labelOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function RuleChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 48,
    minWidth: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  disabled: { opacity: 0.5 },
  label: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  labelOn: { color: colors.textOnDark },
});
