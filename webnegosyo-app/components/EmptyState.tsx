import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

/**
 * What a list shows when there is nothing in it.
 *
 * Empty is a state a merchant has to read, not a blank: the screen says what
 * would normally be here, why it is not, and (when there is one) the way out.
 * `message` alone still works for the many call sites that pass a sentence;
 * newer ones give it an icon and a short title so the emptiness is legible
 * at a glance from across the counter.
 */
interface EmptyStateProps {
  icon?: IconName;
  title?: string;
  message?: string;
  /**
   * The way out, when the emptiness is something the merchant caused and can
   * undo — a filter combination that matched nothing, most often.
   */
  actionLabel?: string;
  onAction?: () => void;
  /** Draws the state inside its own quiet card rather than on the canvas. */
  inset?: boolean;
}

export function EmptyState({
  icon,
  title,
  message = title ? undefined : "No data yet",
  actionLabel,
  onAction,
  inset,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, inset && styles.inset]}>
      {icon ? (
        <View style={styles.tile}>
          <Icon name={icon} size={22} color={colors.textSecondary} />
        </View>
      ) : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} tone="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl + spacing.sm,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  inset: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  text: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 300,
  },
  action: { marginTop: spacing.md },
});
