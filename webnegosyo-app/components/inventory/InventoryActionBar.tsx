import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius, shadow } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";

export type InventoryAction = "receive" | "stocktake" | "waste" | "transfer";

interface ActionSpec {
  key: InventoryAction;
  label: string;
  icon: IconName;
  ink: string;
  tint: string;
}

const ACTIONS: readonly ActionSpec[] = [
  { key: "receive", label: "Receive", icon: "arrow-down", ink: colors.success, tint: colors.successLight },
  { key: "stocktake", label: "Count", icon: "check", ink: colors.info, tint: colors.infoLight },
  { key: "waste", label: "Waste", icon: "trash", ink: colors.danger, tint: colors.dangerLight },
  { key: "transfer", label: "Transfer", icon: "rotate", ink: colors.accent, tint: colors.accentLight },
];

interface InventoryActionBarProps {
  /** Transfer only exists for a store with somewhere to send to. */
  canTransfer: boolean;
  onAction: (action: InventoryAction) => void;
}

/**
 * The four things a merchant does to a shelf, one tap each. Receive, count and
 * waste ask which ingredient next; transfer opens the transfer composer.
 */
export function InventoryActionBar({ canTransfer, onAction }: InventoryActionBarProps) {
  const actions = canTransfer ? ACTIONS : ACTIONS.filter((action) => action.key !== "transfer");

  return (
    <View style={styles.bar}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.key}
          style={styles.action}
          onPress={() => onAction(action.key)}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID={`inventory-action-${action.key}`}
        >
          <View style={[styles.badge, { backgroundColor: action.tint }]}>
            <Icon name={action.icon} size={20} color={action.ink} strokeWidth={2} />
          </View>
          <Text style={styles.label}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadow.sm,
  },
  action: { flex: 1, alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
});
