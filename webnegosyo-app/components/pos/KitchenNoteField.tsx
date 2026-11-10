import React, { type Ref } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { KITCHEN_NOTE_CHIPS, hasNoteChip, toggleNoteChip } from "../../lib/kitchen-note-chips";
import { MAX_LINE_NOTE_LENGTH } from "../../lib/pos-cart";

interface KitchenNoteFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** The text box itself, so a sheet can focus it once it has finished opening. */
  inputRef?: Ref<TextInput>;
  /**
   * Text box above the chips. The line-note sheet wants it right under its
   * title so it stays above the keyboard on a small phone; the option picker
   * keeps the chips first.
   */
  isInputFirst?: boolean;
  /** False where a sheet's title already says it (the line-note sheet). */
  showLabel?: boolean;
  /** The text box got focus (the option picker scrolls it into view). */
  onFocus?: () => void;
}

/** The one wording for an item note, on every register surface. */
export const KITCHEN_NOTE_LABEL = "Note for the kitchen";

/**
 * "Note for the kitchen": quick chips that toggle into the text, and the text
 * itself. Shared by the line-note sheet and the option picker, so the same
 * request reads the same on every ticket.
 */
export function KitchenNoteField({
  value,
  onChange,
  inputRef,
  isInputFirst = false,
  showLabel = true,
  onFocus,
}: KitchenNoteFieldProps) {
  const input = (
    <TextInput
      ref={inputRef}
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder="Type a note (optional)"
      placeholderTextColor={colors.textTertiary}
      maxLength={MAX_LINE_NOTE_LENGTH}
      multiline
      onFocus={onFocus}
      accessibilityLabel={KITCHEN_NOTE_LABEL}
    />
  );
  return (
    <View style={styles.wrap}>
      {showLabel ? <Text style={styles.label}>{KITCHEN_NOTE_LABEL}</Text> : null}
      {isInputFirst ? input : null}
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
      {isInputFirst ? null : input}
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
