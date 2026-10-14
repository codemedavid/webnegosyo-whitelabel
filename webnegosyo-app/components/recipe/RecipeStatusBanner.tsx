import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";

const BANNER_TONES = {
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.statusPending.text },
  info: { bg: colors.card, fg: colors.textSecondary },
} as const;

export type RecipeBannerTone = keyof typeof BANNER_TONES;

interface RecipeStatusBannerProps {
  tone: RecipeBannerTone;
  icon: IconName;
  title: string;
  message: string;
}

/** Whether a dish (or one of its choices) moves stock when it sells. */
export function RecipeStatusBanner({ tone, icon, title, message }: RecipeStatusBannerProps) {
  const palette = BANNER_TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} accessibilityRole="summary">
      <View style={[styles.bannerIcon, { borderColor: palette.fg }]}>
        <Icon name={icon} size={16} color={palette.fg} strokeWidth={2.25} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.bannerTitle, { color: palette.fg }]}>{title}</Text>
        <Text style={styles.bannerText}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  bannerIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontSize: 15, fontWeight: "700" },
  bannerText: { ...typography.caption, color: colors.textPrimary, marginTop: 2, lineHeight: 18 },
});
