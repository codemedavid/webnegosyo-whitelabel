import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, typography, radius, spacing } from "../../theme/colors";
import { Icon } from "../Icon";

export type ReprintStatus = "printing" | "printed" | "failed" | null;

interface ReprintButtonProps {
  status: ReprintStatus;
  onPress: () => void;
}

/**
 * The reprint button that says what it is doing. A plain outline button gave
 * the cashier nothing after the tap — no spinner, no confirmation — so they
 * tapped again and the printer produced two receipts. Now the tap shows
 * "Printing…" and locks, then "Printed" for a moment before it is ready again.
 */
export function ReprintButton({ status, onPress }: ReprintButtonProps) {
  const isPrinting = status === "printing";
  const isPrinted = status === "printed";

  return (
    <TouchableOpacity
      style={[styles.button, isPrinted && styles.buttonPrinted]}
      onPress={onPress}
      disabled={isPrinting}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ busy: isPrinting, disabled: isPrinting }}
      accessibilityLabel={isPrinting ? "Printing receipt" : isPrinted ? "Receipt printed" : "Reprint receipt"}
    >
      <View style={styles.inner}>
        {isPrinting ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : isPrinted ? (
          <Icon name="check" size={18} color={colors.success} />
        ) : (
          <Icon name="printer" size={18} color={colors.primary} />
        )}
        <Text style={[styles.text, isPrinted && styles.textPrinted]}>
          {isPrinting ? "Printing…" : isPrinted ? "Printed" : "Reprint Receipt"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonPrinted: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  inner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  text: { color: colors.primary, ...typography.heading },
  textPrinted: { color: colors.success },
});
