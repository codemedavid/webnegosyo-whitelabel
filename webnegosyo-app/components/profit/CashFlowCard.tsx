import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ProfitReport } from "../../lib/profit/profit-model";
import { CASH_OUT_LABELS, formatMoney } from "../../lib/profit/profit-view";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { profitCard } from "./profit-styles";

function CashLine({ label, cents, isOut }: { label: string; cents: number; isOut: boolean }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${isOut ? "Out" : "In"}: ${label}, ${formatMoney(cents)}`}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, profitCard.tabular]}>{formatMoney(cents)}</Text>
    </View>
  );
}

/** What came in and what went out, stock purchases, big purchases and owner draws included. */
export function CashFlowCard({ report, onSort }: { report: ProfitReport; onSort: () => void }) {
  const { cashFlow } = report;
  const out = cashFlow.out.filter((line) => line.cents !== 0);
  const isNetOut = cashFlow.netCents < 0;
  return (
    <View style={profitCard.card}>
      <Text style={profitCard.title}>Cash flow</Text>
      <Text style={profitCard.hint}>What came in and what went out: stock purchases, big purchases and owner draws included.</Text>
      <Text style={styles.group}>Came in</Text>
      <CashLine label="Collected from sales" cents={cashFlow.inCents} isOut={false} />
      {out.length > 0 ? <Text style={styles.group}>Went out</Text> : null}
      {out.map((line) => (
        <CashLine key={line.key} label={CASH_OUT_LABELS[line.key]} cents={line.cents} isOut />
      ))}
      <View
        style={styles.total}
        accessible
        accessibilityLabel={`Net cash ${isNetOut ? "out" : "in"}: ${formatMoney(Math.abs(cashFlow.netCents))}`}
      >
        <Text style={styles.totalLabel}>{isNetOut ? "More went out than came in" : "Cash left over"}</Text>
        <Text style={[styles.totalValue, profitCard.tabular, isNetOut && styles.netOut]}>{formatMoney(cashFlow.netCents)}</Text>
      </View>
      {cashFlow.unsortedPayouts > 0 ? (
        <View style={styles.action}>
          <View style={styles.well}>
            <Icon name="drawer" size={18} color={colors.statusPending.text} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.actionTitle}>Give these a category</Text>
            <Text style={styles.actionDetail}>
              Not counted above: {cashFlow.unsortedPayouts} drawer {cashFlow.unsortedPayouts === 1 ? "pay-out" : "pay-outs"} (
              {formatMoney(cashFlow.unsortedPayoutCents)}).
            </Text>
          </View>
          <Button label="Open" onPress={onSort} tone="secondary" size="sm" fullWidth={false} accessibilityHint="Give drawer pay-outs a category" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { ...typography.eyebrow, color: colors.textMuted, marginTop: spacing.sm },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.md, minHeight: 28 },
  lineLabel: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  lineValue: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  totalLabel: { ...typography.heading, color: colors.textPrimary, flexShrink: 1 },
  totalValue: { fontSize: 24, fontWeight: "800", color: colors.textPrimary },
  netOut: { color: colors.danger },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  well: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.warningLight, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  actionTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  actionDetail: { ...typography.caption, color: colors.textSecondary },
});
