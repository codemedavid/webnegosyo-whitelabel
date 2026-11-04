import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { CategoryLook } from "../../../lib/expenses/category-look";
import type { PillTone, StatusPill } from "../../../lib/expenses/expense-detail";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { BigAmount } from "../BigAmount";
import { CategoryTile } from "../CategoryTile";

interface DetailHeroProps {
  look: CategoryLook;
  amountCents: number;
  /** "LPG 11kg · Gas / LPG" — note first, then the category. */
  title: string;
  status: StatusPill;
  isVoid: boolean;
}

const PILL: Record<PillTone, { bg: string; text: string }> = {
  good: { bg: colors.successLight, text: colors.success },
  neutral: { bg: colors.surfaceSubtle, text: colors.textMuted },
  warning: { bg: colors.statusPending.bg, text: colors.statusPending.text },
  danger: { bg: colors.dangerLight, text: colors.danger },
};

/** The white hero: what it was, how much (in ink, struck when voided) and its status in words. */
export function DetailHero({ look, amountCents, title, status, isVoid }: DetailHeroProps) {
  const tone = PILL[status.tone];
  return (
    <View style={styles.card}>
      <CategoryTile look={look} size={44} isMuted={isVoid} />
      <BigAmount cents={amountCents} color={colors.textPrimary} isStruck={isVoid} testID="expense-amount" />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pillText, { color: tone.text }]} numberOfLines={2}>
          {status.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadow.sm,
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary, textAlign: "center" },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4, maxWidth: "100%" },
  pillText: { ...typography.caption, fontWeight: "700", textAlign: "center" },
});
