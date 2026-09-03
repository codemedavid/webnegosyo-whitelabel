import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { colors, radius, shadow } from "../theme/colors";
import { Icon, type IconName } from "./Icon";

/**
 * A round, 44pt icon button for header actions.
 *
 * Every screen used to spell its actions out as words in the title row —
 * "Scan QR", "Printer", "Account", "Export" — which ate the width a title
 * needs and looked different on every screen. One shape, one size, one icon
 * set; the word survives as the accessibility label and in the hub's rows.
 */
export type IconButtonTone = "ghost" | "primary";

interface IconButtonProps {
  icon: IconName;
  /** Read by screen readers and by UI tests; name the action, not the icon. */
  label: string;
  onPress: () => void;
  tone?: IconButtonTone;
  /** Colour of a small status dot at the top-right corner, e.g. printer online. */
  dot?: string | null;
  disabled?: boolean;
  testID?: string;
}

export const ICON_BUTTON_SIZE = 44;

export function IconButton({
  icon,
  label,
  onPress,
  tone = "ghost",
  dot,
  disabled,
  testID,
}: IconButtonProps) {
  const isPrimary = tone === "primary";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.button, isPrimary ? styles.primary : styles.ghost, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      testID={testID}
    >
      <Icon name={icon} size={21} color={isPrimary ? colors.textOnDark : colors.textPrimary} />
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  primary: {
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  disabled: { opacity: 0.45 },
  dot: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.card,
  },
});
