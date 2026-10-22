import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { BillPill as BillPillModel, BillPillTone, BillRowModel } from "../../../lib/expenses/bills-screen";
import { categoryLook } from "../../../lib/expenses/category-look";
import type { ExpenseCategory } from "../../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { CategoryTile } from "../CategoryTile";

/**
 * State in words AND colour: coral for what to do now (late, due today),
 * amber for soon, green once paid, quiet grey for later, paused or skipped.
 * Never red: a late bill is a reminder, not a loss.
 */
const PILL_COLORS: Readonly<Record<BillPillTone, { bg: string; fg: string }>> = {
  late: { bg: colors.accentLight, fg: colors.accent },
  today: { bg: colors.accentLight, fg: colors.accent },
  soon: { bg: colors.warningLight, fg: colors.statusPending.text },
  later: { bg: colors.surfaceSubtle, fg: colors.textMuted },
  snoozed: { bg: colors.infoLight, fg: colors.info },
  paused: { bg: colors.surfaceSubtle, fg: colors.textMuted },
  paid: { bg: colors.successLight, fg: colors.success },
  skipped: { bg: colors.surfaceSubtle, fg: colors.textMuted },
};

export function BillPill({ pill }: { pill: BillPillModel }) {
  const tone = PILL_COLORS[pill.tone];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]} numberOfLines={1}>
        {pill.text}
      </Text>
    </View>
  );
}

interface BillRowProps {
  row: BillRowModel;
  category: ExpenseCategory | null;
  onPress: (row: BillRowModel) => void;
  isDivided?: boolean;
  /** "Mark paid" / "Pay" beside the row (the Expenses home card). */
  actionLabel?: string;
  onAction?: (row: BillRowModel) => void;
}

/**
 * One bill: its category tile, name, how often (or how many months were
 * missed), the amount ("about ₱6,200" for an estimate) and its state pill.
 */
function BillRowView({ row, category, onPress, isDivided = false, actionLabel, onAction }: BillRowProps) {
  const amount = row.amount ?? "Amount changes";
  const sub = row.note ?? row.rule;
  const label = `${row.bill.name}, ${amount}, ${row.pill.text}. ${sub}`;
  return (
    <View style={[styles.wrap, isDivided && styles.divided]}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => onPress(row)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={`bill-row-${row.bill.id}`}
      >
        <CategoryTile look={categoryLook(category)} size={30} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {row.bill.name}
          </Text>
          <Text style={[styles.sub, row.note !== null && styles.subWarn]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, row.amount === null && styles.amountUnknown]} numberOfLines={1}>
            {amount}
          </Text>
          <BillPill pill={row.pill} />
        </View>
      </TouchableOpacity>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          size="sm"
          tone={row.pill.tone === "late" || row.pill.tone === "today" ? "primary" : "secondary"}
          fullWidth={false}
          onPress={() => onAction(row)}
          accessibilityLabel={`${actionLabel}: ${row.bill.name}`}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export const BillRow = memo(BillRowView);

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingRight: spacing.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  body: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textMuted },
  subWarn: { color: colors.statusPending.text, fontWeight: "600" },
  right: { alignItems: "flex-end", gap: 4, maxWidth: "45%" },
  amount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  amountUnknown: { ...typography.caption, fontWeight: "600", color: colors.textMuted },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { ...typography.small, fontWeight: "700" },
  action: { marginLeft: spacing.xs },
});
