import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import type { QuickAction } from "../lib/home-quick-actions";
import { Icon } from "./Icon";

/**
 * The shortcuts row under Home's takings: one tile per thing the merchant
 * does most, the way a balance card has send / add / request under it.
 * Pure presentation — which actions exist is decided in
 * lib/home-quick-actions.ts, so this never has to ask about permissions.
 */
export function QuickActions({
  actions,
  onPress,
}: {
  actions: readonly QuickAction[];
  onPress: (action: QuickAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <View style={styles.row} accessibilityRole="toolbar">
      {actions.map((action) => (
        <TouchableOpacity
          key={action.key}
          style={styles.tile}
          onPress={() => onPress(action)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <View style={styles.iconWrap}>
            <Icon name={action.icon} size={22} color={colors.textPrimary} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...typography.small, fontWeight: "700", color: colors.textPrimary },
});
