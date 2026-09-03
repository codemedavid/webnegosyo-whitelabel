import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, typography, spacing } from "../theme/colors";
import { IconButton } from "./IconButton";

/**
 * The header of a screen the merchant pushed onto a tab: order detail,
 * account, printer settings, team. A drawn back chevron (the same 44pt
 * button as every other header action) replaces the "← Back" text that
 * each of these screens used to draw its own way, and the title sits on the
 * same line so the screen names itself before the content loads.
 */
interface BackHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Right-side actions; use `IconButton`s. */
  actions?: React.ReactNode;
}

export function BackHeader({ title, subtitle, onBack, actions }: BackHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <IconButton icon="back" label="Back" onPress={onBack ?? (() => router.back())} />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  copy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
