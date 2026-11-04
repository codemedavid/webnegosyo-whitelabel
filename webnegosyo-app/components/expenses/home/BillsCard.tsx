import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { HOME_CARD_ROWS, type BillRowModel } from "../../../lib/expenses/bills-screen";
import type { ExpenseCategory } from "../../../lib/expenses/types";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Icon } from "../../Icon";
import { SectionHeader } from "../../SectionHeader";
import { BillRow } from "../bills/BillRow";

interface BillsCardProps {
  /** Open rows, late first (`buildBillsView().open`). */
  rows: readonly BillRowModel[];
  categories: ReadonlyMap<string, ExpenseCategory>;
  onOpen: (row: BillRowModel) => void;
  onPay: (row: BillRowModel) => void;
  onSeeAll: () => void;
}

/**
 * "Bills to pay" under the Expenses hero: the next few, late first, each with
 * its own pay button; "See all N" opens the full list. Absent when nothing is
 * open — a calm month needs no card.
 */
export function BillsCard({ rows, categories, onOpen, onPay, onSeeAll }: BillsCardProps) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, HOME_CARD_ROWS);
  return (
    <View>
      <SectionHeader
        title="Bills to pay"
        actionLabel={rows.length > HOME_CARD_ROWS ? `See all ${rows.length}` : "See all"}
        onAction={onSeeAll}
        style={styles.header}
      />
      <View style={styles.card}>
        {shown.map((row, index) => (
          <BillRow
            key={row.key}
            row={row}
            category={categories.get(row.bill.categoryId) ?? null}
            onPress={onOpen}
            isDivided={index > 0}
            actionLabel={row.pill.tone === "late" || row.pill.tone === "today" ? "Pay" : "Mark paid"}
            onAction={onPay}
          />
        ))}
      </View>
    </View>
  );
}

interface BillsDoorProps {
  onPress: () => void;
}

/** One quiet line for a store with no bills yet — never a big card. */
export function BillsDoor({ onPress }: BillsDoorProps) {
  return (
    <TouchableOpacity
      style={styles.door}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Set up bills you pay every month"
      testID="bills-door"
    >
      <Icon name="calendar" size={16} color={colors.textMuted} />
      <Text style={styles.doorText}>Set up bills you pay every month</Text>
      <Icon name="chevron" size={14} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm },
  door: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.xs },
  doorText: { ...typography.caption, fontWeight: "600", color: colors.textMuted, flex: 1 },
});
