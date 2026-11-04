import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { KITCHEN_NOTE_CHIPS, hasNoteChip, toggleNoteChip } from "../../lib/kitchen-note-chips";
import { MAX_LINE_NOTE_LENGTH } from "../../lib/pos-cart";

interface KitchenNoteFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** Focus the text box on open — the line-note sheet has nothing else to do. */
  autoFocus?: boolean;
}

/**
 * "Note for kitchen": quick chips that toggle into the text, and the text
 * itself. Shared by the line-note sheet and the option picker, so the same
 * request reads the same on every ticket.
 */
export function KitchenNoteField({ value, onChange, autoFocus = false }: KitchenNoteFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Note for kitchen</Text>
      <View style={styles.chips}>
        {KITCHEN_NOTE_CHIPS.map((chip) => {
          const isOn = hasNoteChip(value, chip);
          return (
            <TouchableOpacity
              key={chip}
              style={[styles.chip, isOn && styles.chipOn]}
              onPress={() => onChange(toggleNoteChip(value, chip).slice(0, MAX_LINE_NOTE_LENGTH))}
              accessibilityRole="button"
              accessibilityState={{ selected: isOn }}
              accessibilityLabel={isOn ? `Remove ${chip}` : `Add ${chip}`}
            >
              <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{chip}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Type a note (optional)"
        placeholderTextColor={colors.textTertiary}
        maxLength={MAX_LINE_NOTE_LENGTH}
        multiline
        autoFocus={autoFocus}
        accessibilityLabel="Note for kitchen"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  chipTextOn: { color: colors.accent, fontWeight: "700" },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 72,
    textAlignVertical: "top",
  },
});
