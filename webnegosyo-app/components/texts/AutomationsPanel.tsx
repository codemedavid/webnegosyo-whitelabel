import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { SectionHeader } from "../SectionHeader";
import { Icon } from "../Icon";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import type { Automation, AutomationsView, RecipeId } from "../../lib/sms-automations/api";
import { automationStatusLine, blockerFor, readyToSetUp } from "../../lib/sms-automations/view";
import { AutomationCard, RecipeCard } from "./AutomationCard";

/** How many recipes lead the first-run screen; the rest wait under "More ideas". */
const FIRST_RUN_PICKS = 3;

interface AutomationsPanelProps {
  view: AutomationsView;
  busyId: string | null;
  onOpen: (recipe: RecipeId) => void;
  onTurnOn: (automation: Automation) => void;
  onTurnOff: (automation: Automation) => void;
}

/**
 * The automations the store runs, each with its switch, then the ones it has
 * not set up yet. A store with none leads with the few that pay off soonest
 * (`readyToSetUp` puts the runnable ones first), so the first screen is three
 * one-tap starts rather than a blank list.
 */
export function AutomationsPanel({ view, busyId, onOpen, onTurnOn, onTurnOff }: AutomationsPanelProps) {
  const open = readyToSetUp(view);

  if (view.automations.length === 0) {
    const [picks, rest] = [open.slice(0, FIRST_RUN_PICKS), open.slice(FIRST_RUN_PICKS)];
    return (
      <View>
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Icon name="message" size={26} color={colors.accent} />
          </View>
          <Text style={styles.introTitle}>Texts that bring guests back, on their own</Text>
          <Text style={styles.introText}>
            Pick one below. You choose the words and when it goes out; your phone sends it, a few at a time, never at night.
          </Text>
        </View>
        <SectionHeader title="Start with one of these" />
        <RecipeList recipes={picks} view={view} onOpen={onOpen} />
        {rest.length > 0 ? (
          <>
            <SectionHeader title="More ideas" />
            <RecipeList recipes={rest} view={view} onOpen={onOpen} />
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.list}>
        {view.automations.map((automation) => {
          const isBlocked = automation.status === "on" && blockerFor(automation.recipe, view) !== null;
          return (
            <AutomationCard
              key={automation.id}
              automation={automation}
              statusLine={automationStatusLine(automation, view)}
              isBlocked={isBlocked}
              isBusy={busyId === automation.id}
              onPress={() => onOpen(automation.recipe)}
              onToggle={(isOn) => (isOn ? onTurnOn(automation) : onTurnOff(automation))}
            />
          );
        })}
      </View>
      {open.length > 0 ? (
        <>
          <SectionHeader title="Ready to set up" hint="Tap one to see its message before anything is sent" />
          <RecipeList recipes={open} view={view} onOpen={onOpen} />
        </>
      ) : null}
    </View>
  );
}

function RecipeList({ recipes, view, onOpen }: { recipes: AutomationsView["recipes"]; view: AutomationsView; onOpen: (recipe: RecipeId) => void }) {
  return (
    <View style={styles.list}>
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          blockerText={blockerFor(recipe.id, view)?.text ?? null}
          onPress={() => onOpen(recipe.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  intro: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.sm,
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  introTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2, color: colors.textPrimary },
  introText: { ...typography.body, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 21 },
});
