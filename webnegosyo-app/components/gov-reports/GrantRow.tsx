import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { maskIdNumber } from "../../lib/gov-discount";
import { formatManilaDateTime, formatPesoCentavos, kindCode, orderReference } from "../../lib/gov-reports/format";
import { latestVerdict } from "../../lib/gov-reports/review-queue";
import type { GrantEntry } from "../../lib/gov-reports/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

interface GrantRowProps {
  grant: GrantEntry;
  onPress: (grant: GrantEntry) => void;
  isLast?: boolean;
}

interface Pill {
  text: string;
  tone: "danger" | "warning" | "ok" | "muted";
}

const PILL_COLORS: Record<Pill["tone"], { bg: string; fg: string }> = {
  danger: { bg: colors.dangerLight, fg: colors.danger },
  warning: { bg: colors.statusPending.bg, fg: colors.statusPending.text },
  ok: { bg: colors.successLight, fg: colors.success },
  muted: { bg: colors.primaryLight, fg: colors.textPrimary },
};

function pillsOf(grant: GrantEntry): Pill[] {
  const verdict = latestVerdict(grant);
  const pills: Pill[] = [];
  if (grant.reversedAt) pills.push({ text: "Taken back", tone: "muted" });
  if (verdict === "problem") pills.push({ text: "Problem", tone: "danger" });
  else if (verdict === "ok") pills.push({ text: "Checked", tone: "ok" });
  else if (grant.flags.length > 0) {
    pills.push({ text: grant.flags.length === 1 ? "1 flag" : `${grant.flags.length} flags`, tone: "warning" });
  }
  return pills;
}

/** One grant in the ledger: who, which ID (masked), which order, how much came off. */
export function GrantRow({ grant, onPress, isLast }: GrantRowProps) {
  const pills = pillsOf(grant);
  const order = orderReference(grant);
  const when = formatManilaDateTime(grant.occurredAt);
  const masked = maskIdNumber(grant.idNumber);
  const label = [
    `${kindCode(grant.kind)} ${grant.claimantName}`,
    `ID ending ${masked.replace(/•/g, "")}`,
    `order ${order}`,
    when,
    `${formatPesoCentavos(grant.reduction)} off`,
    ...pills.map((p) => p.text),
  ].join(", ");

  return (
    <TouchableOpacity
      style={[styles.row, !isLast && styles.divider]}
      onPress={() => onPress(grant)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the discount, its flags and review"
    >
      <View style={styles.code}>
        <Text style={styles.codeText}>{kindCode(grant.kind)}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, grant.reversedAt !== null && styles.struck]} numberOfLines={1}>
          {grant.claimantName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {masked} · {order} · {when}
        </Text>
        {pills.length > 0 ? (
          <View style={styles.pills}>
            {pills.map((pill) => (
              <View key={pill.text} style={[styles.pill, { backgroundColor: PILL_COLORS[pill.tone].bg }]}>
                <Text style={[styles.pillText, { color: PILL_COLORS[pill.tone].fg }]}>{pill.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Text style={styles.amount}>{formatPesoCentavos(grant.reduction)}</Text>
      <Icon name="chevron" size={14} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  code: {
    minWidth: 40,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  codeText: { ...typography.small, fontWeight: "800", color: colors.textOnDark, letterSpacing: 0.5 },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  struck: { textDecorationLine: "line-through", color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2 },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { ...typography.small, fontWeight: "700" },
  amount: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
