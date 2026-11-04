import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { FOLDED_GROUPS, type BillGroup, type BillGroupKey, type BillRowModel } from "../../../lib/expenses/bills-screen";
import type { ExpenseCategory } from "../../../lib/expenses/types";
import { colors, radius, shadow, spacing } from "../../../theme/colors";
import { SectionHeader } from "../../SectionHeader";
import { BillRow } from "./BillRow";

interface BillGroupsProps {
  groups: readonly BillGroup[];
  categories: ReadonlyMap<string, ExpenseCategory>;
  onOpen: (row: BillRowModel) => void;
}

/**
 * Late · This week · Later, each in one white card; Paused and Paid this month
 * folded under a "Show" until tapped, so the screen leads with what to pay.
 */
export function BillGroups({ groups, categories, onOpen }: BillGroupsProps) {
  const [open, setOpen] = useState<ReadonlySet<BillGroupKey>>(new Set());
  const toggle = (key: BillGroupKey) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <View style={styles.stack}>
      {groups.map((group) => {
        const isFolded = FOLDED_GROUPS.has(group.key) && !open.has(group.key);
        const count = group.rows.length;
        return (
          <View key={group.key}>
            <SectionHeader
              title={group.title}
              hint={isFolded ? `${count} ${count === 1 ? "bill" : "bills"}` : undefined}
              actionLabel={FOLDED_GROUPS.has(group.key) ? (isFolded ? "Show" : "Hide") : undefined}
              onAction={FOLDED_GROUPS.has(group.key) ? () => toggle(group.key) : undefined}
              style={styles.header}
            />
            {isFolded ? null : (
              <View style={styles.card}>
                {group.rows.map((row, index) => (
                  <BillRow key={row.key} row={row} category={categories.get(row.bill.categoryId) ?? null} onPress={onOpen} isDivided={index > 0} />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  header: { marginBottom: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm },
});
