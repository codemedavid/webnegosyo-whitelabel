import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatCents } from "../../../lib/expenses/expense-format";
import type { HomeDay, HomeRow } from "../../../lib/expenses/expenses-home-rows";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { ExpenseRow } from "../ExpenseRow";

interface DayHeaderProps {
  title: string;
  totalCents: number;
}

/** "TODAY · THU 22 OCT" and the day's total, on the canvas above its card. */
export function DayHeader({ title, totalCents }: DayHeaderProps) {
  return (
    <View style={styles.header} accessibilityRole="header">
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.total}>{formatCents(totalCents, { compact: true })}</Text>
    </View>
  );
}

interface DayCardProps {
  day: HomeDay;
  onOpen: (row: HomeRow) => void;
}

/** One day's rows in one white card (no border, small shadow). */
function DayCardView({ day, onOpen }: DayCardProps) {
  return (
    <View style={styles.card}>
      {day.rows.map((row, index) => (
        <ExpenseRow key={row.key} row={row} onPress={onOpen} isDivided={index > 0} />
      ))}
    </View>
  );
}

export const DayCard = memo(DayCardView);

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  title: { ...typography.eyebrow, color: colors.textMuted, flexShrink: 1 },
  total: { ...typography.caption, fontWeight: "800", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm },
});
