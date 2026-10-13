import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import { Icon } from "../Icon";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import type { Automation, RecipeInfo } from "../../lib/sms-automations/api";

interface AutomationCardProps {
  automation: Automation;
  /** `automationStatusLine` — what happened, or the one thing to fix. */
  statusLine: string;
  /** The status line names a blocker rather than a result. */
  isBlocked: boolean;
  isBusy?: boolean;
  onPress: () => void;
  onToggle: (isOn: boolean) => void;
}

/** One automation: what it does in a sentence, what it did, and its switch. */
export function AutomationCard({ automation, statusLine, isBlocked, isBusy, onPress, onToggle }: AutomationCardProps) {
  const isOn = automation.status === "on";
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${automation.name}. ${automation.description}. ${statusLine}`}
      accessibilityHint="Opens its settings and message"
    >
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>{automation.name}</Text>
        <Text style={styles.description} numberOfLines={2}>{automation.description}</Text>
        <View style={styles.statusRow}>
          {isBlocked ? <Icon name="warning" size={14} color={colors.statusPending.text} /> : null}
          <Text style={[styles.status, isOn && styles.statusOn, isBlocked && styles.statusBlocked]} numberOfLines={2}>
            {statusLine}
          </Text>
        </View>
      </View>
      <Switch
        value={isOn}
        disabled={isBusy}
        onValueChange={onToggle}
        trackColor={{ false: colors.separator, true: colors.success }}
        accessibilityLabel={`${automation.name} ${isOn ? "on" : "off"}`}
        testID={`automation-switch-${automation.recipe}`}
      />
    </TouchableOpacity>
  );
}

interface RecipeCardProps {
  recipe: RecipeInfo;
  /** A blocker's short text ("Add your review link to start"), if any. */
  blockerText: string | null;
  onPress: () => void;
}

/** A recipe the store has not set up yet: why it is worth it, one tap to start. */
export function RecipeCard({ recipe, blockerText, onPress }: RecipeCardProps) {
  return (
    <TouchableOpacity
      style={styles.recipe}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Set up ${recipe.title}. ${recipe.pitch}${blockerText ? `. ${blockerText}` : ""}`}
    >
      <View style={styles.copy}>
        <Text style={styles.name}>{recipe.title}</Text>
        <Text style={styles.description}>{recipe.pitch}</Text>
        {blockerText ? (
          <View style={styles.statusRow}>
            <Icon name="info" size={14} color={colors.textSecondary} />
            <Text style={styles.status}>{blockerText}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.add}>
        <Icon name="plus" size={18} color={colors.textPrimary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  recipe: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  description: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  status: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", flexShrink: 1 },
  statusOn: { color: colors.success },
  statusBlocked: { color: colors.statusPending.text },
  add: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
});
