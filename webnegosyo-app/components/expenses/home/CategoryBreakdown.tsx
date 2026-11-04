import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { categoryLook, groupTone } from "../../../lib/expenses/category-look";
import { formatCents } from "../../../lib/expenses/expense-format";
import type { CategoryLine } from "../../../lib/expenses/expenses-home-rows";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { CategoryTile } from "../CategoryTile";

interface CategoryBreakdownProps {
  lines: readonly CategoryLine[];
  onPick: (categoryId: string) => void;
}

const FALLBACK_NAME = "Other";

/**
 * "By category": where the money went, biggest first. Each bar is drawn in
 * its group's ink against the biggest category; a tap filters the list to it.
 */
export function CategoryBreakdown({ lines, onPick }: CategoryBreakdownProps) {
  if (lines.length === 0) {
    return (
      <View style={[styles.card, styles.empty]}>
        <Text style={styles.emptyText}>Nothing spent here yet.</Text>
      </View>
    );
  }
  const largest = lines[0]?.cents ?? 1;
  return (
    <View style={styles.card}>
      {lines.map((line, index) => {
        const name = line.category?.name ?? FALLBACK_NAME;
        const amount = formatCents(line.cents, { compact: true });
        return (
          <TouchableOpacity
            key={line.categoryId}
            style={[styles.row, index > 0 && styles.divided]}
            onPress={() => onPick(line.categoryId)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${amount}, ${line.percent} percent, ${line.count} ${line.count === 1 ? "expense" : "expenses"}. Show these`}
          >
            <CategoryTile look={categoryLook(line.category)} size={30} />
            <View style={styles.body}>
              <View style={styles.topLine}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.amount}>{amount}</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.max(2, Math.round((line.cents / largest) * 100))}%`, backgroundColor: groupTone(line.group).ink },
                  ]}
                />
              </View>
              <Text style={styles.meta}>
                {line.percent}% · {line.count} {line.count === 1 ? "expense" : "expenses"}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, ...shadow.sm },
  empty: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyText: { ...typography.caption, color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  body: { flex: 1, gap: 5 },
  topLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  amount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  track: { height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.full },
  meta: { ...typography.small, color: colors.textMuted, fontVariant: ["tabular-nums"] },
});
