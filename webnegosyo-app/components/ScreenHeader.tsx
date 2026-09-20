import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, typography, spacing } from "../theme/colors";

/**
 * The header every tab screen shares.
 *
 * One large title with the screen's actions beside it, one line of context
 * under it, and an optional toolbar. Nothing else: the view-switcher chip that
 * used to sit above the title is gone with the views themselves, so the first
 * thing on every screen is its name.
 *
 *   Orders                                        ( ⎙ ) ( ◯ )
 *   Live queue · Main branch
 *   [ optional toolbar: search, filters, segmented controls ]
 *
 * Horizontal padding is built in; mount it as the first sibling above the
 * screen's scroll view, not inside a padded content container.
 */
interface ScreenHeaderProps {
  title: string;
  /** One line of context under the title: a branch name, a period, a count. */
  subtitle?: string;
  /** Right side of the title row. Use `IconButton`s; three at most. */
  actions?: React.ReactNode;
  /** Search fields and filter controls that belong to the header. */
  children?: React.ReactNode;
  /** Set when a full-bleed banner above the header already cleared the notch. */
  ignoreTopInset?: boolean;
  /**
   * `dark` for screens that sit on an ink ground (the kitchen board): the
   * title and subtitle flip to cream; pass the ground itself via `style`.
   */
  tone?: "light" | "dark";
  style?: ViewStyle;
}

export function ScreenHeader({
  title,
  subtitle,
  actions,
  children,
  ignoreTopInset,
  tone = "light",
  style,
}: ScreenHeaderProps) {
  const isDark = tone === "dark";
  const insets = useSafeAreaInsets();
  const paddingTop = (ignoreTopInset ? 0 : insets.top) + spacing.md;
  return (
    <View style={[styles.wrap, { paddingTop }, style]}>
      <View style={styles.titleRow}>
        <Text
          style={[styles.title, isDark && styles.titleDark]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {children ? <View style={styles.toolbar}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 44,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  titleDark: { color: colors.heroInkText },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  subtitleDark: { color: colors.heroInkMuted },
  toolbar: { marginTop: spacing.md },
});
