import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CampaignPreset } from "../../../lib/sms/campaign-presets";
import { Icon, type IconName } from "../../Icon";
import { StepIntro } from "./StepIntro";
import { colors, radius, spacing, typography } from "../../../theme/colors";

/**
 * Step one: what the merchant wants to happen.
 *
 * The old editor opened on a blank form that was invalid before a key was
 * pressed. This opens on outcomes — "win back lapsed guests" — each with the
 * number of guests it would reach today, so the first decision is about the
 * business, and the app fills in the six fields that follow from it.
 */

export const BLANK_GOAL_ID = "blank";

/** A drawn mark per goal. Unknown presets fall back to a message balloon. */
const GOAL_ICONS: Record<string, IconName> = {
  win_back: "rotate",
  slipping_regulars: "clock",
  second_visit: "customers",
  weekend_promo: "calendar",
  thank_regulars: "gift",
};

interface GoalStepProps {
  presets: readonly CampaignPreset[];
  /** Guests each preset would reach right now, by preset id. */
  reachById: Record<string, number>;
  selectedId: string | null;
  onPick: (presetId: string) => void;
}

export function GoalStep({ presets, reachById, selectedId, onPick }: GoalStepProps) {
  return (
    <View style={styles.wrap}>
      <StepIntro
        title="What do you want to do?"
        hint="Pick a goal and we'll write the message, choose the guests and set a time. You can change anything after."
      />

      <View style={styles.grid}>
        {presets.map((preset) => {
          const reach = reachById[preset.id] ?? 0;
          const isSelected = selectedId === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.tile, isSelected && styles.tileSelected]}
              onPress={() => onPick(preset.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${preset.title}. ${preset.description} Reaches ${reach} guests today.`}
            >
              <View style={styles.iconTile}>
                <Icon name={GOAL_ICONS[preset.id] ?? "message"} size={20} color={colors.accent} />
              </View>
              <View style={styles.tileCopy}>
                <Text style={styles.tileTitle}>{preset.title}</Text>
                <Text style={styles.tagline}>{preset.tagline}</Text>
              </View>
              <View style={styles.reachRow}>
                <View style={[styles.reachDot, reach > 0 && styles.reachDotLive]} />
                <Text style={[styles.reach, reach === 0 && styles.reachNone]}>
                  {reach === 0 ? "Nobody yet" : `${reach} ${reach === 1 ? "guest" : "guests"}`}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.blank, selectedId === BLANK_GOAL_ID && styles.tileSelected]}
        onPress={() => onPick(BLANK_GOAL_ID)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Write your own campaign from scratch"
      >
        <Icon name="edit" size={20} color={colors.textPrimary} />
        <View style={styles.tileCopy}>
          <Text style={styles.tileTitle}>Write your own</Text>
          <Text style={styles.tagline}>Start with a blank message</Text>
        </View>
        <Icon name="chevron" size={14} color={colors.textTertiary} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    flexBasis: "46%",
    flexGrow: 1,
    minHeight: 156,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: "space-between",
  },
  tileSelected: { borderColor: colors.primary, borderWidth: 2, margin: -1 },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tileCopy: { flex: 1, gap: 3 },
  tileTitle: { ...typography.body, fontWeight: "800", color: colors.textPrimary, lineHeight: 20 },
  tagline: { ...typography.caption, color: colors.textSecondary, lineHeight: 17 },
  reachRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reachDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textTertiary },
  reachDotLive: { backgroundColor: colors.success },
  reach: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  reachNone: { color: colors.textSecondary, fontWeight: "600" },
  blank: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
