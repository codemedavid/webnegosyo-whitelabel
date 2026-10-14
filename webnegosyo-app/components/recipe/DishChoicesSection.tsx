import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Icon } from "../Icon";
import { targetKey, type OptionRecipeChoice, type OptionRecipeGroup } from "../../lib/recipe-target";

interface DishChoicesSectionProps {
  groups: readonly OptionRecipeGroup[];
  /** Ingredient lines per `targetKey`; null when the counts could not be read. */
  coverage: Readonly<Record<string, number>> | null;
  onOpen: (choice: OptionRecipeChoice) => void;
}

function statusOf(lines: number | undefined, isKnown: boolean): string {
  if (!isKnown) return "Tap to set up";
  if (!lines) return "No ingredients";
  return `${lines} ${lines === 1 ? "ingredient" : "ingredients"}`;
}

/**
 * Every choice on the dish — flavours, sizes, add-ons — each opening its own
 * recipe. A choice's ingredients are spent each time it is picked, on top of
 * the dish's own, so a "pick your flavours ×3" dish deducts three flavours.
 */
export function DishChoicesSection({ groups, coverage, onOpen }: DishChoicesSectionProps) {
  if (groups.length === 0) return null;

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.eyebrow}>Choices</Text>
        <Text style={styles.sectionHint}>Used per pick</Text>
      </View>
      <Text style={styles.intro}>
        Give a choice its own ingredients when picking it uses more stock — a flavour, a bigger
        size, an extra side. They are deducted on top of the dish&apos;s own recipe, once for every
        time the choice is picked.
      </Text>
      {groups.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={styles.list}>
            {group.choices.map((choice, index) => {
              const lines = coverage?.[targetKey(choice.target)];
              const hasLines = Boolean(lines);
              const status = statusOf(lines, coverage !== null);
              return (
                <View key={choice.optionId}>
                  {index > 0 && <View style={styles.separator} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => onOpen(choice)}
                    accessibilityRole="button"
                    accessibilityLabel={`${choice.name}, ${status}. Edit its ingredients`}
                  >
                    <Text style={styles.choiceName} numberOfLines={2}>
                      {choice.name}
                    </Text>
                    <Text style={[styles.status, hasLines && styles.statusSet]}>{status}</Text>
                    <Icon name="chevron" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  sectionHint: { ...typography.caption, color: colors.textSecondary },
  intro: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  group: { marginBottom: spacing.lg },
  groupName: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  choiceName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  status: { ...typography.caption, color: colors.textTertiary },
  statusSet: { color: colors.success, fontWeight: "600" },
});
