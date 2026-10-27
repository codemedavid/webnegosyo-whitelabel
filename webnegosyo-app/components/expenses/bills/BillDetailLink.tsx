import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon } from "../../Icon";

interface PaidForCardProps {
  /** "Rent · October". */
  text: string;
  onPress: () => void;
  /** "Not for this bill" (asked first). Absent = not offered (a voided expense, no access). */
  onUnlink?: () => void;
  isUnlinking?: boolean;
}

/** The question before a wrong link is taken off: the expense itself never changes. */
export function confirmUnlink(text: string, onConfirm: () => void): void {
  Alert.alert("Not for this bill?", `This expense stays as it is. ${text} goes back to Bills to pay.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Not for this bill", style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * "Paid for: Rent · October" on an expense that paid a bill; opens that bill.
 * "Not for this bill" undoes a wrong link (asked first).
 */
export function PaidForCard({ text, onPress, onUnlink, isUnlinking = false }: PaidForCardProps) {
  const link = (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Paid for: ${text}. Open the bill`}
      testID="expense-paid-for"
    >
      <Text style={styles.label}>Paid for</Text>
      <View style={styles.value}>
        <Text style={styles.valueText} numberOfLines={1}>
          {text}
        </Text>
        <Icon name="chevron" size={16} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
  if (!onUnlink) return link;
  return (
    <View style={styles.paidFor}>
      {link}
      <View style={styles.unlink}>
        <Button
          label="Not for this bill"
          tone="ghost"
          size="sm"
          fullWidth={false}
          onPress={() => confirmUnlink(text, onUnlink)}
          isLoading={isUnlinking}
          disabled={isUnlinking}
          testID="expense-unlink-bill"
        />
      </View>
    </View>
  );
}

interface RepeatThisProps {
  categoryName: string;
  onPress: () => void;
}

/** "Pay this every month? Repeat this" — turns a one-off rent or internet expense into a bill. */
export function RepeatThis({ categoryName, onPress }: RepeatThisProps) {
  return (
    <View style={styles.repeat}>
      <Text style={styles.repeatText}>Pay {categoryName} every month? Get a reminder before it is due.</Text>
      <Button label="Repeat this" icon="repeat" tone="secondary" size="sm" fullWidth={false} onPress={onPress} testID="expense-repeat-bill" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  paidFor: { gap: spacing.xs },
  unlink: { alignItems: "flex-end" },
  label: { ...typography.caption, color: colors.textMuted },
  value: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  valueText: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  repeat: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
  repeatText: { ...typography.caption, color: colors.textMuted, flex: 1 },
});
