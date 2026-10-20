import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { GOV_DISCOUNT_RULES, type GovDiscountKind, type VatStatus } from "../../../lib/gov-discount";

type Props = {
  kinds: readonly GovDiscountKind[];
  vatStatus: VatStatus;
  onPick: (kind: GovDiscountKind) => void;
};

/** "20% off · no VAT" — what the customer gets, in the store's own terms. */
function benefitLine(kind: GovDiscountKind, vatStatus: VatStatus): string {
  const rule = GOV_DISCOUNT_RULES[kind];
  if (vatStatus === "vat" && rule.vatTreatment === "exempt") return `${rule.ratePercent}% off · no VAT`;
  return `${rule.ratePercent}% off`;
}

/**
 * Step 1 — who is claiming. Big targets: this is tapped standing up, often
 * while the customer is still holding the card out.
 */
export function KindTiles({ kinds, vatStatus, onPick }: Props) {
  return (
    <View style={styles.grid}>
      {kinds.map((kind) => {
        const rule = GOV_DISCOUNT_RULES[kind];
        return (
          <TouchableOpacity
            key={kind}
            style={styles.tile}
            onPress={() => onPick(kind)}
            accessibilityRole="button"
            accessibilityLabel={`${rule.label}, ${benefitLine(kind, vatStatus)}`}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{rule.code}</Text>
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {rule.label}
            </Text>
            <Text style={styles.benefit}>{benefitLine(kind, vatStatus)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 112,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    justifyContent: "flex-end",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
  },
  badgeText: { ...typography.eyebrow, color: colors.textOnDark },
  label: { ...typography.heading, color: colors.textPrimary },
  benefit: { ...typography.caption, color: colors.success, fontWeight: "600" },
});
