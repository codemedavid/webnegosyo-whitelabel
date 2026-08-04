import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import type { VoucherChoice } from "../../lib/pos-voucher-picker";

interface VoucherChoiceRowProps {
  choice: VoucherChoice;
  onApply: () => void;
  onRemove: () => void;
}

/**
 * One of the shop's promotions, as a cashier meets it.
 *
 * Three states, and the distinction between the last two is the point of the
 * row. A code that is ON the sale offers to come back off. A code that CANNOT
 * go on says why in the engine's own words — "Add ₱200.00 more" is something
 * the cashier can act on at the counter, where a row that simply did nothing
 * when tapped reads as a broken app.
 */
export function VoucherChoiceRow({ choice, onApply, onRemove }: VoucherChoiceRowProps) {
  const { voucher, isApplied, isUsable, reason, terms } = choice;

  return (
    <View style={[styles.row, isApplied && styles.rowApplied, !isUsable && !isApplied && styles.rowSpent]}>
      <View style={styles.detail}>
        <Text style={styles.code}>{voucher.code}</Text>
        <Text style={styles.terms}>{terms}</Text>
        {reason && <Text style={styles.reason}>{reason}</Text>}
      </View>

      {isApplied ? (
        <TouchableOpacity
          style={styles.remove}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove voucher ${voucher.code}`}
        >
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.use, !isUsable && styles.useDisabled]}
          onPress={onApply}
          // Disabled rather than hidden: a greyed Use next to the reason says
          // "this code is real, just not for this sale", which is what the
          // cashier has to tell the customer.
          disabled={!isUsable}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isUsable }}
          accessibilityLabel={`Apply voucher ${voucher.code}`}
        >
          <Text style={styles.useText}>Use</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowApplied: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rowSpent: { opacity: 0.55 },
  detail: { flex: 1, gap: 2 },
  code: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  terms: { ...typography.caption, color: colors.textSecondary },
  reason: { ...typography.caption, color: colors.danger },
  use: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  useDisabled: { opacity: 0.4 },
  useText: { ...typography.body, fontWeight: "700", color: colors.card },
  remove: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  removeText: { ...typography.body, fontWeight: "700", color: colors.danger },
});
