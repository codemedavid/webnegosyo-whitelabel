import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { NeedsYouItem, NeedsYouTone } from "../../../lib/expenses/expenses-home-needs";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon } from "../../Icon";

const WELL_SIZE = 36;

const WELL: Readonly<Record<NeedsYouTone, { bg: string; fg: string }>> = {
  warning: { bg: colors.warningLight, fg: colors.statusPending.text },
  accent: { bg: colors.accentLight, fg: colors.accent },
  info: { bg: colors.infoLight, fg: colors.info },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

interface NeedsYouCardProps {
  items: readonly NeedsYouItem[];
  onAction: (item: NeedsYouItem) => void;
  /** An item with `dismissLabel` ("Not now") shows it as a second button only when this is given. */
  onDismiss?: (item: NeedsYouItem) => void;
}

/**
 * "Needs you": the few things the owner should deal with, each with the one
 * button that does it (the Reports action-row idiom). Not drawn when empty —
 * a calm book needs no card telling the owner it is calm.
 */
export function NeedsYouCard({ items, onAction, onDismiss }: NeedsYouCardProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      {items.map((item, index) => {
        const well = WELL[item.tone];
        const action = (
          <Button
            label={item.cta}
            onPress={() => onAction(item)}
            tone={index === 0 ? "primary" : "secondary"}
            size="sm"
            fullWidth={false}
            accessibilityHint={item.title}
          />
        );
        // A suggestion ("Make it a bill?") is a question: two answers, under the words.
        const canDismiss = item.dismissLabel !== undefined && onDismiss !== undefined;
        return (
          <View key={item.key} style={[styles.row, index > 0 && styles.divided, canDismiss && styles.wrapping]}>
            <View style={[styles.well, { backgroundColor: well.bg }]}>
              <Icon name={item.icon} size={18} color={well.fg} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
            {canDismiss ? (
              <View style={styles.answers}>
                {action}
                <Button
                  label={item.dismissLabel as string}
                  onPress={() => onDismiss(item)}
                  tone="ghost"
                  size="sm"
                  fullWidth={false}
                  accessibilityHint={item.title}
                />
              </View>
            ) : (
              action
            )}
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
  wrapping: { flexWrap: "wrap" },
  answers: { flexDirection: "row", gap: spacing.sm, flexBasis: "100%", paddingLeft: WELL_SIZE + spacing.md },
  well: { width: WELL_SIZE, height: WELL_SIZE, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textMuted },
});
