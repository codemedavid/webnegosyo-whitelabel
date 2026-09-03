import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, typography, spacing } from "../theme/colors";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

/**
 * The header every tab screen shares.
 *
 * Before this, seventeen screens each drew their own: some put the view
 * switcher above the title, some beside it, some below; actions were words in
 * one place and pills in another; and every one of them hard-coded a 60pt top
 * gap that was wrong on any phone whose notch was not the one it was drawn on.
 *
 * The shape is the native one — a small bar (where am I, what can I do here)
 * over a large title — so a merchant never has to re-learn a screen:
 *
 *   [ ▦ Operations ▾ ]                          ( ⌕ ) ( ⎙ ) ( ◯ )
 *   Orders
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
  /** Right side of the bar. Use `IconButton`s; two or three at most. */
  actions?: React.ReactNode;
  /** Hidden on the Menu hub, which has nothing to switch away from. */
  showSwitcher?: boolean;
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
  showSwitcher = true,
  children,
  ignoreTopInset,
  tone = "light",
  style,
}: ScreenHeaderProps) {
  const isDark = tone === "dark";
  const insets = useSafeAreaInsets();
  const paddingTop = (ignoreTopInset ? 0 : insets.top) + spacing.sm;
  return (
    <View style={[styles.wrap, { paddingTop }, style]}>
      <View style={styles.bar}>
        {showSwitcher ? <WorkspaceSwitcher /> : <View />}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      <Text
        style={[styles.title, isDark && styles.titleDark]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
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
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4, color: colors.textPrimary },
  titleDark: { color: colors.heroInkText },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  subtitleDark: { color: colors.heroInkMuted },
  toolbar: { marginTop: spacing.md },
});
