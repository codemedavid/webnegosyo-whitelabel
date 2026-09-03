import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";
import { Icon, type IconName } from "./Icon";

/**
 * A navigation row: icon tile, title, one-line hint, chevron.
 *
 * The Menu hub, the Account screen and the view switcher all list places the
 * merchant can go. They used to draw that list three different ways; this is
 * the one way. Stacked rows share their hairline (`grouped`) so a list reads
 * as one surface rather than a pile of cards.
 */
export type ListRowTone = "default" | "ink" | "accent" | "danger";

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  tone?: ListRowTone;
  onPress?: () => void;
  /** Replaces the chevron, e.g. a status pill or a switch. */
  trailing?: React.ReactNode;
  /** Draws the row as the current place; the chevron is dropped. */
  isActive?: boolean;
  /** Set on every row but the last when rows are stacked inside one card. */
  grouped?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
}

const TILE_COLORS: Record<ListRowTone, { bg: string; fg: string }> = {
  default: { bg: colors.surfaceSubtle, fg: colors.textPrimary },
  ink: { bg: colors.primary, fg: colors.textOnDark },
  accent: { bg: colors.accentLight, fg: colors.accent },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

export function ListRow({
  title,
  subtitle,
  icon,
  tone = "default",
  onPress,
  trailing,
  isActive,
  grouped,
  accessibilityLabel,
  style,
  testID,
}: ListRowProps) {
  const tile = TILE_COLORS[isActive ? "ink" : tone];
  const isDanger = tone === "danger";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      style={[styles.row, grouped && styles.grouped, style]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      accessibilityState={isActive ? { selected: true } : undefined}
      testID={testID}
    >
      {icon ? (
        <View style={[styles.tile, { backgroundColor: tile.bg }]}>
          <Icon name={icon} size={20} color={tile.fg} />
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text style={[styles.title, isDanger && styles.titleDanger]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing !== undefined ? (
        trailing
      ) : isActive ? (
        <View style={styles.activePill}>
          <Text style={styles.activePillText}>Current</Text>
        </View>
      ) : onPress ? (
        <Icon name="chevron" size={16} color={colors.textTertiary} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  grouped: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  titleDanger: { color: colors.danger },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  activePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  activePillText: { ...typography.small, fontWeight: "700", color: colors.textPrimary },
});
