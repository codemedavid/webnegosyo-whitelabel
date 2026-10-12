import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Card } from "../Card";
import { colors, typography, spacing, radius } from "../../theme/colors";
import type { OrderDiscountPayload } from "../../lib/order-discount";
import { govOrderSummary } from "../../lib/order-gov-summary";

/**
 * The Senior/PWD part of an order: who claimed it, their share and what came
 * off, and the VAT block at a VAT store. The money is already in the discount
 * rows above; this card says WHO and WHY.
 *
 * ID numbers stay masked until the cashier asks — the screen is read across a
 * counter, and the full number is on the printed receipt. Rows come from
 * `govOrderSummary`, shared with the web admin and the receipt.
 */
interface GovDiscountCardProps {
  discount: OrderDiscountPayload | null;
  style?: React.ComponentProps<typeof Card>["style"];
}

const peso = (amount: number) => `₱${amount.toFixed(2)}`;

export function GovDiscountCard({ discount, style }: GovDiscountCardProps) {
  const [isIdShown, setIsIdShown] = useState(false);
  const summary = govOrderSummary(discount?.government);
  if (!summary) return null;

  return (
    <Card title="Senior / PWD" style={style}>
      {summary.claimants.map((claimant, index) => (
        <View
          key={claimant.id}
          style={[styles.claimant, index > 0 && styles.claimantBorder]}
          accessibilityLabel={`${claimant.kindLabel} ${claimant.name}`}
        >
          <View style={styles.claimantMain}>
            <View style={styles.nameRow}>
              <View style={styles.code}>
                <Text style={styles.codeText}>{claimant.code}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {claimant.name}
              </Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              ID {isIdShown ? claimant.idNumber : claimant.maskedId} · {claimant.basis}
            </Text>
          </View>
          <View style={styles.amounts}>
            <Text style={styles.meta}>Share {peso(claimant.share)}</Text>
            <Text style={styles.reduction}>−{peso(claimant.reduction)}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity
        onPress={() => setIsIdShown((shown) => !shown)}
        accessibilityRole="button"
        accessibilityState={{ selected: isIdShown }}
        hitSlop={8}
      >
        <Text style={styles.toggle}>{isIdShown ? "Hide ID numbers" : "Show ID numbers"}</Text>
      </TouchableOpacity>

      {summary.vatRows.length > 0 && (
        <View style={styles.vat}>
          {summary.vatRows.map((row) => (
            <View key={row.kind} style={styles.vatRow}>
              <Text style={styles.vatLabel}>{row.label}</Text>
              <Text style={styles.vatValue}>
                {row.kind === "lessDiscount" ? "−" : ""}
                {peso(row.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {summary.approverName ? (
        <Text style={styles.approval}>Approved by {summary.approverName}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  claimant: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  claimantBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  claimantMain: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: {
    backgroundColor: colors.successLight,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  codeText: { ...typography.small, fontWeight: "800", color: colors.success },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  amounts: { alignItems: "flex-end" },
  reduction: { ...typography.body, fontWeight: "600", color: colors.success, marginTop: 2 },
  toggle: { ...typography.caption, fontWeight: "600", color: colors.textSecondary, paddingVertical: spacing.xs },
  vat: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  vatRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  vatLabel: { ...typography.caption, color: colors.textSecondary },
  vatValue: { ...typography.caption, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  approval: { ...typography.small, color: colors.textSecondary, marginTop: spacing.sm },
});
