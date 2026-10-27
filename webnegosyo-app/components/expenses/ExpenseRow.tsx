import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { categoryLook } from "../../lib/expenses/category-look";
import { formatCents, spokenCents } from "../../lib/expenses/expense-format";
import { ROW_NOTE_TEXT, homeRowLabel, type HomeRow, type RowNote } from "../../lib/expenses/expenses-home-rows";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { CategoryTile } from "./CategoryTile";

interface ExpenseRowProps {
  row: HomeRow;
  onPress: (row: HomeRow) => void;
  /** Draws the hairline above the row (every row in a day card but the first). */
  isDivided?: boolean;
}

const NOTE_COLOR: Readonly<Record<RowNote, string>> = {
  no_receipt: colors.textMuted,
  waiting: colors.textMuted,
  refused: colors.danger,
  void: colors.textMuted,
};

/**
 * One line of the expense book: category tile · what · where it came from,
 * who, when · amount. Money out is ink, never red and never with a minus
 * (design brief); the small line under the amount says what still needs a
 * look. A voided row stays visible, struck through.
 */
function ExpenseRowView({ row, onPress, isDivided = false }: ExpenseRowProps) {
  const isVoid = row.status === "void";
  return (
    <TouchableOpacity
      style={[styles.row, isDivided && styles.divided]}
      onPress={() => onPress(row)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={homeRowLabel(row, spokenCents(row.amountCents))}
    >
      <CategoryTile look={categoryLook(row.category)} size={30} isMuted={isVoid} />
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, isVoid && styles.struck]} numberOfLines={1}>
            {row.title}
          </Text>
          {row.isCashMoved ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Cash moved</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {row.meta}
        </Text>
      </View>
      <View style={styles.amountColumn}>
        <Text style={[styles.amount, isVoid && styles.struck]} numberOfLines={1}>
          {formatCents(row.amountCents, { compact: true })}
        </Text>
        {row.note ? (
          <View style={styles.noteLine}>
            {row.note === "no_receipt" ? <View style={styles.dot} /> : null}
            <Text style={[styles.note, { color: NOTE_COLOR[row.note] }]} numberOfLines={1}>
              {ROW_NOTE_TEXT[row.note]}
            </Text>
          </View>
        ) : null}
      </View>
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
    minHeight: 60,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  body: { flex: 1, gap: 2 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  struck: { textDecorationLine: "line-through", color: colors.textMuted },
  tag: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  tagText: { ...typography.small, fontWeight: "700", color: colors.textMuted },
  meta: { ...typography.caption, color: colors.textMuted },
  amountColumn: { alignItems: "flex-end", gap: 2, maxWidth: "40%" },
  amount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  noteLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  note: { ...typography.small, fontWeight: "600" },
});
