import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Icon } from "../Icon";
import { colors, radius, spacing, typography } from "../../theme/colors";
import type { Tone } from "../../lib/sms-automations/view";

interface SenderStripProps {
  tone: Tone;
  text: string;
  onPress: () => void;
}

/** Whether texts can go out right now, in one line; tap to reach the sending phone. */
export function SenderStrip({ tone, text, onPress }: SenderStripProps) {
  const isGood = tone === "good";
  return (
    <TouchableOpacity
      style={[styles.strip, isGood ? styles.good : styles.warning]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Sending phone: ${text}`}
      accessibilityHint="Opens the sending phone settings"
    >
      <View style={[styles.dot, { backgroundColor: isGood ? colors.success : colors.warning }]} />
      <Text style={[styles.text, !isGood && styles.textWarning]} numberOfLines={2}>{text}</Text>
      <Icon name="chevron" size={14} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  good: { backgroundColor: colors.successLight, borderColor: colors.successLight },
  warning: { backgroundColor: colors.warningLight, borderColor: colors.warningLight },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  text: { ...typography.caption, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  textWarning: { color: colors.statusPending.text },
});
