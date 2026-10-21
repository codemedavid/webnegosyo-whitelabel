import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { NeedsYouItem, NeedsYouTone } from "../../../lib/expenses/expenses-home-needs";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon } from "../../Icon";

const WELL: Readonly<Record<NeedsYouTone, { bg: string; fg: string }>> = {
  warning: { bg: colors.warningLight, fg: colors.statusPending.text },
  accent: { bg: colors.accentLight, fg: colors.accent },
  info: { bg: colors.infoLight, fg: colors.info },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

interface NeedsYouCardProps {
  items: readonly NeedsYouItem[];
  onAction: (item: NeedsYouItem) => void;
}

/**
 * "Needs you": the few things the owner should deal with, each with the one
 * button that does it (the Reports action-row idiom). Not drawn when empty —
 * a calm book needs no card telling the owner it is calm.
 */
export function NeedsYouCard({ items, onAction }: NeedsYouCardProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      {items.map((item, index) => {
        const well = WELL[item.tone];
        return (
          <View key={item.key} style={[styles.row, index > 0 && styles.divided]}>
            <View style={[styles.well, { backgroundColor: well.bg }]}>
              <Icon name={item.icon} size={18} color={well.fg} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
            <Button
              label={item.cta}
              onPress={() => onAction(item)}
              tone={index === 0 ? "primary" : "secondary"}
              size="sm"
              fullWidth={false}
              accessibilityHint={item.title}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, ...shadow.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  well: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textMuted },
});
