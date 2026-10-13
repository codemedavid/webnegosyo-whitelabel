import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../../theme/colors";
import { renderSampleText, segmentText } from "../../../lib/sms-automations/view";

interface MessagePreviewProps {
  template: string;
  storeName: string;
  baseUrl: string;
}

/** The message as a guest's phone shows it, filled with a sample guest, and what it costs. */
export function MessagePreview({ template, storeName, baseUrl }: MessagePreviewProps) {
  const { text } = renderSampleText(template, { storeName, baseUrl });
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Preview: ${text}`}>
      <Text style={styles.from}>{storeName}</Text>
      <View style={styles.bubble}>
        <Text style={styles.text}>{text || " "}</Text>
      </View>
      <Text style={styles.count}>{segmentText(text)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  from: { ...typography.small, color: colors.textSecondary, fontWeight: "700", textAlign: "center" },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    backgroundColor: colors.card,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  text: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  count: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
});
