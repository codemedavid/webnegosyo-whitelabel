import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CampaignPreset } from "../../../lib/sms/campaign-presets";
import { Icon } from "../../Icon";
import { colors, radius, spacing, typography } from "../../../theme/colors";

/**
 * The empty campaign list, as a way in rather than a dead end.
 *
 * "No campaigns yet" with a button above it asked the merchant to imagine
 * what a campaign is. This shows three ready ideas they can open in one tap,
 * each landing on a finished message in the guided flow.
 */
export function CampaignQuickStart({
  presets,
  onStart,
}: {
  presets: readonly CampaignPreset[];
  onStart: (presetId: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Icon name="message" size={22} color={colors.accent} />
        </View>
        <Text style={styles.title}>Bring guests back with a text</Text>
        <Text style={styles.hint}>
          One friendly message to the guests you choose, sent from this phone. Start from an
          idea — it takes about a minute.
        </Text>
      </View>
      <View style={styles.list}>
        {presets.map((preset, index) => (
          <TouchableOpacity
            key={preset.id}
            style={[styles.row, index > 0 && styles.rowDivided]}
            onPress={() => onStart(preset.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Start: ${preset.title}`}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{preset.title}</Text>
              <Text style={styles.rowHint}>{preset.tagline}</Text>
            </View>
            <Icon name="arrow-right" size={16} color={colors.textPrimary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg, marginTop: spacing.md },
  intro: { alignItems: "flex-start", gap: spacing.sm },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...typography.heading, fontSize: 20, color: colors.textPrimary },
  hint: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  list: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.separator },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  rowHint: { ...typography.caption, color: colors.textSecondary },
});
