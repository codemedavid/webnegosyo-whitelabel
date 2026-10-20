import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatPesoCentavos, formatSalesCount } from "../../lib/gov-reports/format";
import type { GroupTotals } from "../../lib/gov-reports/types";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

interface GovGroupListProps {
  groups: readonly GroupTotals[];
}

/** By kind / by cashier: one row per group, net sales and what came off. */
export function GovGroupList({ groups }: GovGroupListProps) {
  return (
    <View style={styles.group}>
      {groups.map((group, index) => (
        <View
          key={group.key}
          style={[styles.row, index < groups.length - 1 && styles.divider]}
          accessible
          accessibilityLabel={`${group.label}: ${formatSalesCount(group.totals.sales)}, ${formatPesoCentavos(group.totals.reduction)} off`}
        >
          <View style={styles.copy}>
            <Text style={styles.label} numberOfLines={1}>
              {group.label}
            </Text>
            <Text style={styles.meta}>
              {formatSalesCount(group.totals.sales)} · 20% {formatPesoCentavos(group.totals.discount)} · VAT{" "}
              {formatPesoCentavos(group.totals.vatRemoved)}
            </Text>
          </View>
          <Text style={styles.amount}>{formatPesoCentavos(group.totals.reduction)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  copy: { flex: 1 },
  label: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 1, fontVariant: ["tabular-nums"] },
  amount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
