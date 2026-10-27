import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { useHoldRepeat } from "../cash/use-hold-repeat";
import { Icon } from "../Icon";

interface StepperProps {
  label: string;
  /** Already formatted ("₱20", "8:00 PM"). */
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
  hint?: string;
  disabled?: boolean;
}

/** A labelled − value + row with 48pt buttons; holding a button repeats (06 §5). */
export function Stepper({ label, value, onDecrease, onIncrease, decreaseLabel, increaseLabel, hint, disabled = false }: StepperProps) {
  const down = useHoldRepeat(onDecrease, disabled);
  const up = useHoldRepeat(onIncrease, disabled);
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, disabled && styles.disabled]}
          {...down}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={decreaseLabel}
        >
          <Icon name="minus" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.value} accessibilityLiveRegion="polite" accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <TouchableOpacity
          style={[styles.button, disabled && styles.disabled]}
          {...up}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={increaseLabel}
        >
          <Icon name="plus" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 64 },
  copy: { flex: 1, gap: 2 },
  label: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  value: { ...typography.heading, fontVariant: ["tabular-nums"], color: colors.textPrimary, minWidth: 76, textAlign: "center" },
});
