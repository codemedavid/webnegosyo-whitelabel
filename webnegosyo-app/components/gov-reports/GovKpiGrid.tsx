import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatPesoCentavos, formatSalesCount } from "../../lib/gov-reports/format";
import type { MoneyTotals } from "../../lib/gov-reports/types";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

interface GovKpiGridProps {
  totals: MoneyTotals;
  reversedCount: number;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ""}`}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

/** Total taken off leads (ink card); the four figures the BIR book adds up sit under it. */
export function GovKpiGrid({ totals, reversedCount }: GovKpiGridProps) {
  const reversedNote =
    reversedCount > 0 ? `Net of ${reversedCount} taken back by an edit or cancel` : "Net of anything taken back";
  return (
    <View>
      <View
        style={styles.hero}
        accessible
        accessibilityLabel={`Total off the bill: ${formatPesoCentavos(totals.reduction)}, ${formatSalesCount(totals.sales)}`}
      >
        <Text style={styles.heroLabel}>Total off the bill</Text>
        <Text style={styles.heroValue}>{formatPesoCentavos(totals.reduction)}</Text>
        <Text style={styles.heroHint}>
          {formatSalesCount(totals.sales)} · {reversedNote}
        </Text>
      </View>
      <View style={styles.row}>
        <Tile label="Gross covered" value={formatPesoCentavos(totals.grossShare)} hint="Their share, before" />
        <Tile label="VAT exempted" value={formatPesoCentavos(totals.vatRemoved)} hint="VAT not charged" />
      </View>
      <View style={styles.row}>
        <Tile label="20% discounts" value={formatPesoCentavos(totals.discount)} hint="The discount itself" />
        <Tile label="VAT-exempt sales" value={formatPesoCentavos(totals.vatExemptSales)} hint="For the sales book" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.md,
  },
  heroLabel: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroValue: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.heroInkText,
    marginTop: spacing.xs,
    fontVariant: ["tabular-nums"],
  },
  heroHint: { ...typography.caption, color: colors.heroInkMuted, marginTop: spacing.xs },
  row: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.sm },
  tileLabel: { ...typography.eyebrow, color: colors.textSecondary },
  tileValue: {
    ...typography.heading,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    fontVariant: ["tabular-nums"],
  },
  tileHint: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
});
