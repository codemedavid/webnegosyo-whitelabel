import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";

export const MAX_PIN_LENGTH = 6;
export const MIN_PIN_LENGTH = 4;

type Props = {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

/**
 * A PIN pad drawn by the app rather than the system keyboard: no predictive
 * bar remembering digits, no keyboard covering the dots, and the same layout
 * on every device the manager picks up.
 */
export function PinPad({ value, onChange, isDisabled = false }: Props) {
  function press(key: (typeof KEYS)[number]) {
    if (isDisabled || key === "") return;
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length < MAX_PIN_LENGTH) onChange(value + key);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessibilityLabel={`${value.length} digits entered`}>
        {Array.from({ length: Math.max(MIN_PIN_LENGTH, value.length) }, (_, index) => (
          <View key={index} style={[styles.dot, index < value.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, index) => (
          <TouchableOpacity
            key={`${key}-${index}`}
            style={[styles.key, key === "" && styles.keyBlank]}
            onPress={() => press(key)}
            disabled={isDisabled || key === ""}
            accessibilityRole="button"
            accessibilityLabel={key === "⌫" ? "Delete digit" : key === "" ? undefined : `Digit ${key}`}
          >
            <Text style={styles.keyText}>{key}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.lg },
  dots: { flexDirection: "row", gap: spacing.md, minHeight: 16 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", width: 264, gap: spacing.sm },
  key: {
    width: 82,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  keyBlank: { backgroundColor: "transparent" },
  keyText: { ...typography.title, fontWeight: "600", color: colors.textPrimary },
});
