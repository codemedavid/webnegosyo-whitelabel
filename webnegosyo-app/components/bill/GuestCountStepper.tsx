import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { IconButton } from "../IconButton";
import { MAX_GUESTS, MIN_GUESTS } from "../../lib/bill/bill-plan";

interface GuestCountStepperProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** "Split between − 3 + people": one number, two buttons. */
export function GuestCountStepper({ value, onChange, disabled = false }: GuestCountStepperProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Split between</Text>
      <View style={styles.control}>
        <IconButton
          icon="minus"
          label="One fewer guest"
          onPress={() => onChange(value - 1)}
          disabled={disabled || value <= MIN_GUESTS}
        />
        <Text style={styles.value} accessibilityLiveRegion="polite">
          {value}
        </Text>
        <IconButton
          icon="plus"
          label="One more guest"
          onPress={() => onChange(value + 1)}
          disabled={disabled || value >= MAX_GUESTS}
        />
      </View>
      <Text style={styles.label}>{value === 1 ? "person" : "people"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  label: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  control: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  value: {
    minWidth: 36,
    textAlign: "center",
    fontSize: 26,
    fontWeight: "800",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
});
