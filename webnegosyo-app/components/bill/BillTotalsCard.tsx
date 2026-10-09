import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { BillSummary } from "../../lib/bill/bill-orders";

/** The one number that matters, big: what is still owed. Total and paid beneath. */
export function BillTotalsCard({ summary }: { summary: BillSummary }) {
  const isSettled = summary.owed <= 0;
  return (
    <View style={[styles.card, isSettled && styles.cardSettled]}>
      <Text style={[styles.eyebrow, isSettled && styles.settledInk]}>
        {isSettled ? "Fully paid" : "Still owed"}
      </Text>
      <Text style={[styles.amount, isSettled && styles.settledInk]} accessibilityLiveRegion="polite">
        {formatPeso(isSettled ? summary.total : summary.owed)}
      </Text>
      <View style={styles.row}>
        <Figure label="Bill total" value={formatPeso(summary.total)} />
        <View style={styles.rule} />
        <Figure label="Paid" value={formatPeso(summary.paid)} />
      </View>
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  cardSettled: { backgroundColor: colors.successLight },
  eyebrow: { ...typography.eyebrow, color: "rgba(255,255,255,0.7)" },
  amount: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.textOnDark,
    fontVariant: ["tabular-nums"],
  },
  settledInk: { color: colors.success },
  row: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  rule: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: spacing.lg },
  figure: { flex: 1, gap: 2 },
  figureLabel: { ...typography.caption, color: colors.textTertiary },
  figureValue: { ...typography.heading, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
});
