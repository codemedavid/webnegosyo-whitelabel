import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { FindingCard } from "../../lib/profit/profit-findings";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { SectionHeader } from "../SectionHeader";
import { profitCard } from "./profit-styles";

const WELLS = {
  warning: { bg: colors.warningLight, fg: colors.statusPending.text },
  info: { bg: colors.infoLight, fg: colors.info },
} as const;

interface FindingsCardProps {
  cards: readonly FindingCard[];
  onAction: (card: FindingCard) => void;
}

/**
 * What would make the number more accurate, as action rows: an icon, what is
 * off, why it matters, and the one button that fixes it (never underlined text).
 */
export function FindingsCard({ cards, onAction }: FindingsCardProps) {
  if (cards.length === 0) return null;
  const firstActionKey = cards.find((card) => card.action)?.key;
  return (
    <View>
      <SectionHeader title="Check these" hint="They change how far you can trust this profit." />
      <View style={[profitCard.card, styles.card]}>
        {cards.map((card, index) => {
          const well = WELLS[card.tone];
          return (
            <View key={card.key} style={[styles.row, index > 0 && styles.divided]}>
              <View style={[styles.well, { backgroundColor: well.bg }]}>
                <Icon name={card.icon} size={18} color={well.fg} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title}>{card.title}</Text>
                <Text style={styles.detail}>{card.detail}</Text>
              </View>
              {card.action ? (
                <Button
                  label={card.action.label}
                  onPress={() => onAction(card)}
                  tone={card.key === firstActionKey ? "primary" : "secondary"}
                  size="sm"
                  fullWidth={false}
                  accessibilityHint={card.title}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 0, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  well: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
});
