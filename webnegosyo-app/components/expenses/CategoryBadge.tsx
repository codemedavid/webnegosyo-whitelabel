import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius } from "../../theme/colors";

interface CategoryBadgeProps {
  /** The category's short code, e.g. "LP". */
  code: string;
  size?: number;
  isMuted?: boolean;
}

/**
 * The category's two-letter mark on a quiet tile. Money out is never red
 * (plan §5.6): the badge carries the category, the row's ink carries the sum.
 */
export function CategoryBadge({ code, size = 36, isMuted = false }: CategoryBadgeProps) {
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: Math.round(size * 0.3) }, isMuted && styles.muted]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.code, { fontSize: Math.round(size * 0.36) }, isMuted && styles.mutedText]} numberOfLines={1}>
        {code.slice(0, 3)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  muted: { opacity: 0.6 },
  code: { fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5 },
  mutedText: { color: colors.textTertiary },
});
