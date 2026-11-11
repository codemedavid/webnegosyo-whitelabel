import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { FactRow } from "../../../lib/expenses/expense-detail";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";

/** When, paid from, branch, who — label left, value right, hairlines between. */
export function FactsCard({ rows }: { rows: readonly FactRow[] }) {
  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <View key={row.key} style={[styles.row, index > 0 && styles.line]} accessible accessibilityLabel={`${row.label}: ${row.value}`}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.lg, paddingVertical: spacing.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  label: { ...typography.caption, color: colors.textMuted, paddingTop: 1 },
  value: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1, textAlign: "right" },
});
