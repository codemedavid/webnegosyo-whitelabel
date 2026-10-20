import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { formatPeso } from "../../../lib/format";
import { GOV_DISCOUNT_RULES, type GovClaimantResult } from "../../../lib/gov-discount";

type Props = {
  claimant: GovClaimantResult | null;
  /** Everything on the bill before any discount (items + service + delivery). */
  saleGross: number;
  /** All claimants' reductions together. */
  totalReduction: number;
  /** Shown instead of figures while the answers are incomplete. */
  pendingMessage?: string | null;
};

/**
 * The live receipt the cashier reads aloud: their share, the VAT that comes
 * off, the 20%, what they pay, and what the whole table now owes.
 */
export function GovPreviewCard({ claimant, saleGross, totalReduction, pendingMessage }: Props) {
  if (!claimant) {
    return (
      <View style={styles.card}>
        <Text style={styles.pending}>{pendingMessage ?? "Answer the steps above to see the discount."}</Text>
      </View>
    );
  }

  const rule = GOV_DISCOUNT_RULES[claimant.kind];
  const vatOff = claimant.vatRemoved + claimant.serviceChargeVatRemoved;
  return (
    <View style={styles.card} accessibilityLabel={`${rule.label} discount: ${formatPeso(claimant.reduction)} off`}>
      <Row label="Their share" value={formatPeso(claimant.grossShare)} />
      {vatOff > 0 ? <Row label="Less VAT (12%)" value={`−${formatPeso(vatOff)}`} isDeduction /> : null}
      <Row label={`Less ${rule.ratePercent}% ${rule.code} discount`} value={`−${formatPeso(claimant.discount)}`} isDeduction />
      <View style={styles.rule} />
      <Row label="They pay" value={formatPeso(claimant.netDue)} isStrong />
      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Whole order</Text>
        <Text style={styles.footerValue}>
          <Text style={styles.was}>{formatPeso(saleGross)}</Text>
          {"  "}
          {formatPeso(Math.max(0, saleGross - totalReduction))}
        </Text>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  isDeduction = false,
  isStrong = false,
}: {
  label: string;
  value: string;
  isDeduction?: boolean;
  isStrong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, isStrong && styles.strong]}>{label}</Text>
      <Text style={[styles.value, isDeduction && styles.deduction, isStrong && styles.strongValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pending: { ...typography.caption, color: colors.heroInkMuted, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { ...typography.caption, color: colors.heroInkMuted },
  value: { ...typography.body, color: colors.heroInkText, fontVariant: ["tabular-nums"] },
  deduction: { color: colors.heroInkPositive },
  strong: { ...typography.body, fontWeight: "700", color: colors.heroInkText },
  strongValue: { fontSize: 22, fontWeight: "800" },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.heroInkMuted, opacity: 0.4 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.heroInkElevated,
  },
  footerLabel: { ...typography.caption, color: colors.heroInkMuted },
  footerValue: { ...typography.caption, color: colors.heroInkText, fontWeight: "700", fontVariant: ["tabular-nums"] },
  was: { color: colors.heroInkMuted, textDecorationLine: "line-through", fontWeight: "400" },
});
