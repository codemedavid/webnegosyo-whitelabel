import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Spoken with the value, e.g. "Sisig". */
  label: string;
  size?: "md" | "lg";
};

/** − value + with 44pt targets; the ends disable rather than wrap. */
export function Stepper({ value, min, max, onChange, label, size = "md" }: Props) {
  const isLarge = size === "lg";
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={`${label}: ${value}`}>
      <TouchableOpacity
        style={[styles.button, isLarge && styles.buttonLarge, !canDecrease && styles.disabled]}
        onPress={() => onChange(value - 1)}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel={`Fewer ${label}`}
        hitSlop={6}
      >
        <Text style={[styles.sign, isLarge && styles.signLarge]}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.value, isLarge && styles.valueLarge]}>{value}</Text>
      <TouchableOpacity
        style={[styles.button, isLarge && styles.buttonLarge, !canIncrease && styles.disabled]}
        onPress={() => onChange(value + 1)}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={`More ${label}`}
        hitSlop={6}
      >
        <Text style={[styles.sign, isLarge && styles.signLarge]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLarge: { width: 52, height: 52 },
  disabled: { opacity: 0.35 },
  sign: { ...typography.heading, color: colors.textPrimary },
  signLarge: { fontSize: 22 },
  value: {
    ...typography.heading,
    minWidth: 28,
    textAlign: "center",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  valueLarge: { fontSize: 28, minWidth: 48 },
});
