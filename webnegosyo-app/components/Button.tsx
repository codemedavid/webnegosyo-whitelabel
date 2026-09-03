import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { Icon, type IconName } from "./Icon";

/**
 * The app's button.
 *
 * Screens used to draw their own — `primaryButton`, `confirmButton`,
 * `collectButton`, `remedyButton`, `addButton` — each a slightly different
 * height, radius and weight, so the same action looked like a different
 * control on every screen. One shape now, in four tones that say how much an
 * action matters:
 *
 *   primary    the one thing to do on this screen (ink, full width by default)
 *   secondary  a real alternative, quieter (card with a hairline)
 *   ghost      a low-stakes link-like action (no surface)
 *   danger     destructive: cancel, remove, delete
 *
 * `label` is both the visible word and the accessibility name unless
 * `accessibilityLabel` says otherwise, so a button never needs a second
 * explanation for a screen reader.
 */
export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: IconName;
  isLoading?: boolean;
  disabled?: boolean;
  /** Stretches across its container. Default for `lg`; off for `sm`. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
const FONT: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };
const ICON: Record<ButtonSize, number> = { sm: 15, md: 17, lg: 18 };

export function Button({
  label,
  onPress,
  tone = "primary",
  size = "md",
  icon,
  isLoading,
  disabled,
  fullWidth,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const isBlocked = !!disabled || !!isLoading;
  const stretch = fullWidth ?? size === "lg";
  const fg = FOREGROUND[tone];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isBlocked}
      activeOpacity={0.75}
      style={[
        styles.base,
        styles[tone],
        { height: HEIGHTS[size], paddingHorizontal: PAD[size] },
        stretch ? styles.fullWidth : styles.hug,
        isBlocked && styles.blocked,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isBlocked, busy: !!isLoading }}
      testID={testID}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={ICON[size]} color={fg} /> : null}
          <Text
            style={[styles.label, { color: fg, fontSize: FONT[size] }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const PAD: Record<ButtonSize, number> = { sm: spacing.md, md: spacing.xl, lg: spacing.xxl };

const FOREGROUND: Record<ButtonTone, string> = {
  primary: colors.textOnDark,
  secondary: colors.textPrimary,
  ghost: colors.textPrimary,
  danger: colors.textOnDark,
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { ...typography.body, fontWeight: "700" },
  fullWidth: { alignSelf: "stretch" },
  hug: { alignSelf: "flex-start" },
  blocked: { opacity: 0.45 },
  primary: { backgroundColor: colors.primary, ...shadow.sm },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.danger },
});
