import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { groupTone } from "../../../lib/expenses/category-look";
import { formatCents } from "../../../lib/expenses/expense-format";
import type { GroupShare } from "../../../lib/expenses/expenses-home-rows";
import type { ExpenseGroup } from "../../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../../theme/colors";

/** Short legend words: the hero's legend wraps on a phone, so "Store", not "Running the store". */
export const SPLIT_LABELS: Readonly<Record<ExpenseGroup, string>> = {
  ingredients: "Ingredients",
  staff: "Staff",
  occupancy: "Rent",
  utilities: "Utilities",
  operating: "Store",
  admin: "Admin",
  other: "Other",
  capex: "Big buys",
  not_expense: "Cash moved",
};

interface HeroSplitProps {
  split: readonly GroupShare[];
}

/** One bar split by kind of spending, then a dot legend with whole percents. */
export function HeroSplit({ split }: HeroSplitProps) {
  if (split.length === 0) {
    return <Text style={styles.empty}>Nothing spent here yet.</Text>;
  }
  return (
    <View>
      <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {split.map((share) => (
          <View key={share.group} style={{ flex: Math.max(share.cents, 1), backgroundColor: groupTone(share.group).onHero }} />
        ))}
      </View>
      <View style={styles.legend}>
        {split.map((share) => (
          <View
            key={share.group}
            style={styles.item}
            accessible
            accessibilityLabel={`${SPLIT_LABELS[share.group]}: ${formatCents(share.cents, { compact: true })}, ${share.percent} percent`}
          >
            <View style={[styles.dot, { backgroundColor: groupTone(share.group).onHero }]} />
            <Text style={styles.label}>{SPLIT_LABELS[share.group]}</Text>
            <Text style={styles.percent}>{share.percent}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: radius.full,
    overflow: "hidden",
    gap: 2,
    marginTop: spacing.lg,
  },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: spacing.xs, marginTop: spacing.md },
  item: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...typography.caption, color: colors.heroInkMuted },
  percent: { ...typography.caption, fontWeight: "800", color: colors.heroInkText, fontVariant: ["tabular-nums"] },
  empty: { ...typography.caption, color: colors.heroInkMuted, marginTop: spacing.md },
});
