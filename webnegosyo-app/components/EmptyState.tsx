import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, radius, spacing } from "../theme/colors";

interface EmptyStateProps {
  message?: string;
  /**
   * The way out, when the emptiness is something the merchant caused and can
   * undo — a filter combination that matched nothing, most often.
   */
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message = "No data yet", actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          style={styles.action}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  text: { ...typography.body, color: colors.textTertiary, textAlign: "center" },
  action: {
    marginTop: spacing.lg,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
});
