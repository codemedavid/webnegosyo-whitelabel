import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { formatPeso } from "../../../lib/format";
import { GOV_DISCOUNT_RULES, maskIdNumber, type GovClaimantResult } from "../../../lib/gov-discount";

type Props = {
  claimant: GovClaimantResult;
  diners: number | null;
  onEdit: () => void;
  onRemove: () => void;
};

function shareText(claimant: GovClaimantResult, diners: number | null): string {
  if (claimant.allocation.mode === "shared") return `Shared table · 1 of ${diners ?? "?"}`;
  const units = Object.values(claimant.allocation.units).reduce((sum, count) => sum + count, 0);
  return `${units} ${units === 1 ? "item" : "items"}`;
}

/** One applied claimant: who, which ID (masked), their share and the saving. */
export function ClaimantCard({ claimant, diners, onEdit, onRemove }: Props) {
  const rule = GOV_DISCOUNT_RULES[claimant.kind];
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{rule.code}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {claimant.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          ID {maskIdNumber(claimant.idNumber)} · {shareText(claimant, diners)}
        </Text>
      </View>
      <Text style={styles.amount}>−{formatPeso(claimant.reduction)}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${claimant.name}`} hitSlop={8}>
          <Text style={styles.action}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${claimant.name}`} hitSlop={8}>
          <Text style={[styles.action, styles.remove]}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  badge: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { ...typography.eyebrow, color: colors.textOnDark },
  text: { flex: 1, gap: 2, minWidth: 120 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  amount: { ...typography.heading, color: colors.success, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", gap: spacing.lg, width: "100%", justifyContent: "flex-end" },
  action: { ...typography.caption, fontWeight: "700", color: colors.primary },
  remove: { color: colors.danger },
});
