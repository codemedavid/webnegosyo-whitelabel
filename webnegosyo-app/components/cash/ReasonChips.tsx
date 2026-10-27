import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { DEFAULT_REASON_FROM_CENTS, isReasonRequired, reasonsFor, type VarianceReasonKey } from "../../lib/cash/reasons";
import { formatCents } from "../../lib/expenses/expense-format";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface ReasonChipsProps {
  /** counted − expected, centavos: picks the short or the over list. */
  differenceCents: number;
  value: VarianceReasonKey | null;
  onChange: (key: VarianceReasonKey | null) => void;
  /** The store's "ask for a reason above" figure (default ₱20). */
  thresholdCents?: number;
  /** Optional note under the chips; omitted = no note field. */
  note?: string;
  onNoteChange?: (note: string) => void;
  /** "Required" shown with the chips, e.g. after a Next tap without one. */
  error?: string | null;
}

export const NOTE_MAX_LENGTH = 300;

/**
 * "What happened?" — one chip from the short or over list (keys stored in
 * staff_shifts.variance_reason), plus an optional note. Says when a reason is
 * needed ("needed above ₱20"). Tapping the chosen chip again clears it.
 */
export function ReasonChips({
  differenceCents,
  value,
  onChange,
  thresholdCents = DEFAULT_REASON_FROM_CENTS,
  note,
  onNoteChange,
  error,
}: ReasonChipsProps) {
  const reasons = reasonsFor(differenceCents);
  if (reasons.length === 0) return null;
  const isRequired = isReasonRequired(differenceCents, thresholdCents);
  const heading = isRequired ? `What happened? · needed above ${formatCents(thresholdCents, { compact: true })}` : "What happened? · optional";
  return (
    <View style={styles.wrap} testID="reason-chips">
      <Text style={styles.eyebrow} accessibilityRole="header">
        {heading}
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {reasons.map((reason) => {
          const isOn = reason.key === value;
          return (
            <Pressable
              key={reason.key}
              onPress={() => onChange(isOn ? null : reason.key)}
              style={[styles.chip, isOn && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isOn }}
              accessibilityLabel={reason.label}
              testID={`reason-${reason.key}`}
            >
              <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{reason.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {onNoteChange ? (
        <TextInput
          value={note ?? ""}
          onChangeText={onNoteChange}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textSecondary}
          maxLength={NOTE_MAX_LENGTH}
          style={styles.input}
          accessibilityLabel="Note about the difference"
          testID="reason-note"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  eyebrow: { ...typography.eyebrow, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  chipTextOn: { color: colors.textOnDark },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
});
