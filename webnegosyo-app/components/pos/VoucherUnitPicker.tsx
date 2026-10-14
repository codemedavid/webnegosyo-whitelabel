import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import type { VoucherUnitChoice } from "../../lib/pos-discount-session";
import type { UnitPicks } from "../../lib/vouchers/types";
import { Stepper } from "./gov-discount/Stepper";

interface VoucherUnitPickerProps {
  choice: VoucherUnitChoice;
  onSave: (code: string, picks: UnitPicks) => void;
}

function appliesTo(choice: VoucherUnitChoice): string {
  const chosen = choice.lines.filter((line) => line.chosen > 0);
  if (chosen.length === 0) return "nothing yet";
  return chosen.map((line) => `${line.name} ×${line.chosen}`).join(", ");
}

/**
 * "Applies to: Fries ×1 · Change" for a voucher that only discounts N items.
 * The engine picks the cheapest by default; Change lets the cashier move it to
 * the dish the customer meant, never more than N in total.
 */
export function VoucherUnitPicker({ choice, onSave }: VoucherUnitPickerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});

  const total = Object.values(draft).reduce((sum, units) => sum + units, 0);

  function open() {
    setDraft(Object.fromEntries(choice.lines.map((line) => [line.lineKey, line.chosen])));
    setIsEditing(true);
  }

  function save() {
    onSave(choice.code, draft);
    setIsEditing(false);
  }

  return (
    <View style={styles.card}>
      <View style={styles.summary}>
        <Text style={styles.text} numberOfLines={2}>
          <Text style={styles.code}>{choice.code}</Text> applies to: {appliesTo(choice)}
        </Text>
        {!isEditing && choice.lines.length > 0 && (
          <TouchableOpacity onPress={open} accessibilityRole="button" accessibilityLabel={`Change which item ${choice.code} applies to`}>
            <Text style={styles.link}>Change</Text>
          </TouchableOpacity>
        )}
      </View>

      {isEditing && (
        <View style={styles.editor}>
          <Text style={styles.hint}>
            Up to {choice.limit} item{choice.limit === 1 ? "" : "s"}. {total} chosen.
          </Text>
          {choice.lines.map((line) => {
            const value = draft[line.lineKey] ?? 0;
            const room = choice.limit - (total - value);
            return (
              <View key={line.lineKey} style={styles.lineRow}>
                <Text style={styles.lineName} numberOfLines={1}>
                  {line.name} <Text style={styles.hint}>of {line.quantity}</Text>
                </Text>
                <Stepper
                  value={value}
                  min={0}
                  max={Math.min(line.quantity, room)}
                  onChange={(units) => setDraft((current) => ({ ...current, [line.lineKey]: units }))}
                  label={line.name}
                />
              </View>
            );
          })}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => setIsEditing(false)} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.save, total === 0 && styles.disabled]}
              onPress={save}
              disabled={total === 0}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>Use these</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  text: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  code: { fontWeight: "700" },
  link: { ...typography.caption, fontWeight: "700", color: colors.primary },
  editor: { gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary },
  lineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  lineName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.lg },
  cancel: { ...typography.body, color: colors.textSecondary },
  save: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  saveText: { ...typography.body, fontWeight: "700", color: colors.card },
  disabled: { opacity: 0.4 },
});
