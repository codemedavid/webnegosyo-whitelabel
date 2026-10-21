import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatCents, spokenCents } from "../../lib/expenses/expense-format";
import { rowAccessibilityLabel, type ExpenseListRow } from "../../lib/expenses/expense-list";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { CategoryBadge } from "./CategoryBadge";

interface ExpenseRowProps {
  row: ExpenseListRow;
  onPress: (row: ExpenseListRow) => void;
}

/**
 * One line of the expense book: category mark · what · who/when · amount.
 * Money out is normal ink with a minus, never red (plan §5.6); a voided row is
 * struck through and stays visible; a row still on this phone says so.
 */
function ExpenseRowView({ row, onPress }: ExpenseRowProps) {
  const sign = row.isVoid ? "" : "−";
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(row)}
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel(row, spokenCents(row.amountCents))}
    >
      <CategoryBadge code={row.icon} isMuted={row.isVoid} />
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, row.isVoid && styles.struck]} numberOfLines={1}>
            {row.title}
          </Text>
          {row.isDrawer ? (
            <View style={styles.till}>
              <Text style={styles.tillText}>DRAWER</Text>
            </View>
          ) : null}
          {row.isNotExpense ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>NOT AN EXPENSE</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaLine}>
          {row.isWaiting ? <Icon name="rotate" size={12} color={colors.textMuted} /> : null}
          {row.refusedReason ? <Icon name="warning" size={12} color={colors.danger} /> : null}
          <Text style={[styles.meta, row.refusedReason !== null && styles.metaRefused]} numberOfLines={1}>
            {row.meta}
          </Text>
          {row.hasReceipt ? <Icon name="photo" size={12} color={colors.textMuted} /> : null}
          {row.needsLook && !row.refusedReason ? <Icon name="info" size={12} color={colors.textMuted} /> : null}
        </View>
      </View>
      <Text style={[styles.amount, row.isVoid && styles.struck]}>
        {sign}
        {formatCents(row.amountCents, { compact: true })}
      </Text>
    </TouchableOpacity>
  );
}

export const ExpenseRow = memo(ExpenseRowView);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  body: { flex: 1, gap: 3 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  struck: { textDecorationLine: "line-through", color: colors.textMuted },
  till: { backgroundColor: colors.successLight, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  tillText: { fontSize: 10, fontWeight: "800", color: colors.success, letterSpacing: 0.4 },
  tag: { backgroundColor: colors.infoLight, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 10, fontWeight: "800", color: colors.info, letterSpacing: 0.4 },
  metaLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  metaRefused: { color: colors.danger, fontWeight: "600" },
  amount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
