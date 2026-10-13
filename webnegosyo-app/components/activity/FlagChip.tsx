import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../../theme/colors";
import { Icon } from "../Icon";

interface FlagChipProps {
  isReviewed: boolean;
}

/**
 * "Check" with the warning glyph, or "Reviewed" with a tick — a word and a
 * shape, never colour alone (spec P7). The word describes the event, not the
 * person: never "Suspicious", "Alert" or "Fraud".
 */
export function FlagChip({ isReviewed }: FlagChipProps) {
  if (isReviewed) {
    return (
      <View style={styles.reviewed} accessible={false}>
        <Icon name="check" size={12} color={colors.textMuted} strokeWidth={2.25} />
        <Text style={styles.reviewedText} maxFontSizeMultiplier={1.6}>
          Reviewed
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.check} accessible={false}>
      <Icon name="warning" size={12} color={colors.statusPending.text} strokeWidth={2.25} />
      <Text style={styles.checkText} maxFontSizeMultiplier={1.6}>
        Check
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.statusPending.bg,
  },
  checkText: { fontSize: 12, fontWeight: "700", color: colors.statusPending.text },
  reviewed: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 2 },
  reviewedText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
});
