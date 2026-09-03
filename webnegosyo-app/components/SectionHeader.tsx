import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";
import { colors, typography, spacing } from "../theme/colors";
import { Icon } from "./Icon";

/**
 * The heading over a group of content on a screen.
 *
 * Screens used to label their sections with an 11pt uppercase eyebrow —
 * "RECENT ORDERS", "TOP PRODUCTS" — the same style the stat cards use for a
 * number's caption, so a merchant scanning a screen could not tell a heading
 * from a label. A section heading is now a real heading: 17pt, sentence case,
 * with an optional plain-language hint under it and, when there is somewhere
 * to go, one text action on the right.
 *
 *   Recent orders                                   See all ›
 *   The last ten placed at this branch
 */
interface SectionHeaderProps {
  title: string;
  hint?: string;
  /** One quiet action, e.g. "See all". Keep the label to a word or two. */
  actionLabel?: string;
  onAction?: () => void;
  /** Right-side content that is not a text action: a count pill, a switch. */
  trailing?: React.ReactNode;
  style?: ViewStyle;
}

export function SectionHeader({
  title,
  hint,
  actionLabel,
  onAction,
  trailing,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {hint ? (
          <Text style={styles.hint} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
      {trailing !== undefined ? (
        trailing
      ) : actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.7}
          hitSlop={8}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Icon name="chevron" size={14} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  copy: { flex: 1 },
  title: { ...typography.heading, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 24,
    paddingBottom: 1,
  },
  actionText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
});
