import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import type { PosCheckoutField } from "../../lib/pos-checkout-fields";

interface CheckoutFieldInputProps {
  field: PosCheckoutField;
  value: string;
  onChange: (next: string) => void;
}

const KEYBOARDS = {
  email: "email-address",
  phone: "phone-pad",
  number: "decimal-pad",
} as const;

/**
 * One of the merchant's own checkout questions, drawn the way its type asks:
 * a dropdown becomes tap-to-pick chips (tap again to clear — every answer is
 * optional at the counter), everything else a text box with the right keyboard.
 */
export function CheckoutFieldInput({ field, value, onChange }: CheckoutFieldInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} numberOfLines={2}>
        {field.label}
      </Text>
      {field.type === "select" ? (
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={field.label}>
          {field.options.map((option) => {
            const isSelected = value === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => onChange(isSelected ? "" : option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <TextInput
          style={[styles.input, field.type === "textarea" && styles.multiline]}
          value={value}
          onChangeText={onChange}
          placeholder={field.placeholder ?? "Optional"}
          placeholderTextColor={colors.textTertiary}
          keyboardType={field.type in KEYBOARDS ? KEYBOARDS[field.type as keyof typeof KEYBOARDS] : "default"}
          autoCapitalize={field.type === "email" ? "none" : "sentences"}
          multiline={field.type === "textarea"}
          accessibilityLabel={`${field.label}, optional`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    minHeight: 36,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  chipTextActive: { color: colors.textOnDark },
});
