import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, spacing, typography } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";

export type MoneyRowTone = "ink" | "good" | "accent" | "danger";

const WELL: Record<MoneyRowTone, { bg: string; fg: string }> = {
  ink: { bg: colors.surfaceSubtle, fg: colors.textPrimary },
  good: { bg: colors.successLight, fg: colors.success },
  accent: { bg: colors.accentLight, fg: colors.accent },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

interface MoneyRowProps {
  icon: IconName;
  tone: MoneyRowTone;
  title: string;
  detail: string;
  onPress: () => void;
  /** Set on every row but the last inside one card. */
  isGrouped?: boolean;
  testID?: string;
}

const WELL_SIZE = 36;

/**
 * One money glance: a round icon well, the figure as the title, what it is
 * made of underneath, and a chevron — Home's "Spent today", Reports' "Money"
 * rows (design screen 06). Figures use equal-width digits.
 */
export function MoneyRow({ icon, tone, title, detail, onPress, isGrouped = false, testID }: MoneyRowProps) {
  const well = WELL[tone];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, isGrouped && styles.grouped]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      testID={testID}
    >
      <View style={[styles.well, { backgroundColor: well.bg }]}>
        <Icon name={icon} size={18} color={well.fg} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Icon name="chevron" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  grouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  well: { width: WELL_SIZE, height: WELL_SIZE, borderRadius: WELL_SIZE / 2, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  detail: { ...typography.caption, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
});
