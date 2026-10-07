import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import type { BringBackAction } from "../../lib/customer-hub/dashboard";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";

const ACTION_ICONS: Record<BringBackAction["key"], IconName> = {
  slipping: "clock",
  lapsed: "rotate",
  one_timers: "customers",
  rewards: "gift",
};

interface BringBackCardProps {
  actions: readonly BringBackAction[];
  onAction: (action: BringBackAction) => void;
}

/**
 * Today's moves. Each row names the people and the size of the group, says
 * in one line why it matters, and carries the one button that does something
 * about it — the report and the remedy on the same line.
 */
export function BringBackCard({ actions, onAction }: BringBackCardProps) {
  if (actions.length === 0) {
    return (
      <View style={[styles.card, styles.calm]}>
        <Icon name="check" size={20} color={colors.success} />
        <Text style={styles.calmText}>Nobody is slipping away right now. Your regulars are on rhythm.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {actions.map((action, index) => (
        <View key={action.key} style={[styles.row, index > 0 && styles.divided]}>
          <View style={styles.iconTile}>
            <Icon name={ACTION_ICONS[action.key]} size={18} color={colors.accent} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{action.title}</Text>
            <Text style={styles.detail}>{action.detail}</Text>
          </View>
          <Button
            label={action.cta}
            onPress={() => onAction(action)}
            tone={index === 0 ? "primary" : "secondary"}
            size="sm"
            fullWidth={false}
            accessibilityHint={action.title}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.sm,
  },
  calm: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  calmText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
});
