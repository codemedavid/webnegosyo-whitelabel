import React from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";

import type { ReasonOption } from "../../lib/approvals/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { OptionPills } from "../OptionPills";

const NOTE_MAX = 500;

interface ReasonPickerProps {
  reasons: readonly ReasonOption[];
  reasonCode: string | null;
  note: string;
  notePlaceholder: string;
  onReason: (code: string) => void;
  onNote: (note: string) => void;
  /** The "Put back in stock" switch (refund / cancel); omitted when no items move. */
  restock?: { value: boolean; onChange: (value: boolean) => void };
}

/**
 * "Why?" — one required chip (never pre-selected), an optional detail that
 * becomes required for Other, and the stock switch pre-set by the reason.
 * Shared by the cashier's request sheet and the approver's decline sheet.
 */
export function ReasonPicker({ reasons, reasonCode, note, notePlaceholder, onReason, onNote, restock }: ReasonPickerProps) {
  const isOther = reasonCode === "other";
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Why?</Text>
      <OptionPills
        options={reasons.map((reason) => ({ label: reason.label, value: reason.code }))}
        isSelected={(code) => code === reasonCode}
        onSelect={onReason}
        accessibilityPrefix="Reason"
      />
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={onNote}
        placeholder={isOther ? "What happened?" : notePlaceholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={isOther ? "What happened?" : notePlaceholder}
        maxLength={NOTE_MAX}
        multiline
      />
      {restock ? (
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Put back in stock</Text>
            <Text style={styles.switchHint}>{restock.value ? "The items go back on the shelf." : "Logged as waste."}</Text>
          </View>
          <Switch value={restock.value} onValueChange={restock.onChange} accessibilityLabel="Put back in stock" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.heading, color: colors.textPrimary },
  input: {
    ...typography.body,
    minHeight: 48,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    color: colors.textPrimary,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56 },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  switchHint: { ...typography.caption, color: colors.textMuted },
});
