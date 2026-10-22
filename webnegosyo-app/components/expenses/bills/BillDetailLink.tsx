import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon } from "../../Icon";

interface PaidForCardProps {
  /** "Rent · October". */
  text: string;
  onPress: () => void;
}

/** "Paid for: Rent · October" on an expense that paid a bill; opens that bill. */
export function PaidForCard({ text, onPress }: PaidForCardProps) {
  return (
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
  label: { ...typography.caption, color: colors.textMuted },
  value: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  valueText: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  repeat: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
  repeatText: { ...typography.caption, color: colors.textMuted, flex: 1 },
});
