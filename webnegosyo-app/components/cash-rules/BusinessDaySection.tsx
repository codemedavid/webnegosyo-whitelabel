import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeCutoff, type CutoffChange } from "../../lib/business-day/trading-day";
import type { CutoffSuggestion } from "../../lib/cash/cutoff-suggestion";
import {
  CUTOFF_CHIPS,
  cutoffChipLabel,
  describeStartsFrom,
  formatDayKey,
  isChipCutoff,
  stepCutoff,
} from "../../lib/cash/rules-form";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { CutoffPreview } from "./CutoffPreview";
import { RuleChip, RuleChipRow } from "./RuleChip";
import { Stepper } from "./Stepper";

export type SaveCutoffResult = { ok: true; effectiveFrom: string } | { ok: false; error: string };

interface BusinessDaySectionProps {
  /** The cutoff today's business day runs on. */
  currentCutoff: number;
  /** A saved change whose first day has not started yet. */
  pending: CutoffChange | null;
  /** The schedule could not be read: never write over a guess. */
  isFallback: boolean;
  /** Owner or Settings, online, not demo. */
  canEdit: boolean;
  /** Why it cannot be edited, shown under the chips. */
  lockedReason: string | null;
  suggestion: CutoffSuggestion | null;
  onSave: (cutoffMinutes: number) => Promise<SaveCutoffResult>;
}

/**
 * "Business day ends at" (06 §2, mockup 10). Chips for 12 AM–6 AM, "Other" for
 * any quarter hour up to 11:45 AM, a live band and sentence, and the server's
 * answer for when the change starts — always a day that has not begun.
 */
export function BusinessDaySection({
  currentCutoff,
  pending,
  isFallback,
  canEdit,
  lockedReason,
  suggestion,
  onSave,
}: BusinessDaySectionProps) {
  const target = pending?.cutoffMinutes ?? currentCutoff;
  const [draft, setDraft] = useState(target);
  const [isOther, setIsOther] = useState(!isChipCutoff(target));
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startsFrom, setStartsFrom] = useState<string | null>(null);
  const isEditable = canEdit && !isFallback && !isSaving;
  const words = describeCutoff(draft);

  const pick = (minutes: number, other = false) => {
    setDraft(minutes);
    setIsOther(other);
    setError(null);
    setStartsFrom(null);
  };

  const save = async (minutes: number) => {
    setSaving(true);
    setError(null);
    const result = await onSave(minutes);
    setSaving(false);
    if (result.ok) {
      setDraft(minutes);
      setStartsFrom(result.effectiveFrom);
    } else {
      setError(result.error);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        Business day ends at
      </Text>
      <RuleChipRow>
        {CUTOFF_CHIPS.map((minutes) => (
          <RuleChip
            key={minutes}
            label={cutoffChipLabel(minutes)}
            accessibilityLabel={minutes === 0 ? "12 AM, midnight" : cutoffChipLabel(minutes)}
            isSelected={!isOther && draft === minutes}
            onPress={() => pick(minutes)}
            disabled={!isEditable}
          />
        ))}
        <RuleChip label="Other" isSelected={isOther} onPress={() => pick(draft, true)} disabled={!isEditable} />
      </RuleChipRow>
      {isOther ? (
        <Stepper
          label="Ends at"
          value={words.label}
          onDecrease={() => pick(stepCutoff(draft, -1), true)}
          onIncrease={() => pick(stepCutoff(draft, 1), true)}
          decreaseLabel="15 minutes earlier"
          increaseLabel="15 minutes later"
          disabled={!isEditable}
        />
      ) : null}

      <CutoffPreview cutoffMinutes={draft} />
      <Text style={styles.sentence}>{words.example} A shift belongs to the day it started.</Text>

      {pending && !startsFrom ? (
        <Text style={styles.note}>
          {`From ${formatDayKey(pending.effectiveFrom)}, your day ends at ${describeCutoff(pending.cutoffMinutes).label}.`}
        </Text>
      ) : null}
      {startsFrom ? (
        <View style={styles.saved} accessibilityRole="alert">
          <Icon name="check" size={16} color={colors.statusReady.text} />
          <Text style={styles.savedText}>{describeStartsFrom(startsFrom)}</Text>
        </View>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {lockedReason ? <Text style={styles.note}>{lockedReason}</Text> : null}

      {isEditable && draft !== target && !startsFrom ? (
        <Button label={`End the day at ${words.label}`} size="lg" onPress={() => void save(draft)} isLoading={isSaving} />
      ) : null}

      {suggestion && isEditable && draft === target ? (
        <View style={styles.suggestion}>
          <Icon name="clock" size={18} color={colors.accent} />
          <View style={styles.suggestionCopy}>
            <Text style={styles.suggestionTitle}>
              {`${Math.round(suggestion.lateShare * 100)}% of your orders come after midnight`}
            </Text>
            <Text style={styles.note}>
              {`Ending your day at ${describeCutoff(suggestion.cutoffMinutes).label} keeps them with the night they belong to.`}
            </Text>
          </View>
          <Button
            label={`Use ${cutoffChipLabel(suggestion.cutoffMinutes)}`}
            size="sm"
            tone="secondary"
            onPress={() => {
              pick(suggestion.cutoffMinutes, !isChipCutoff(suggestion.cutoffMinutes));
              void save(suggestion.cutoffMinutes);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...typography.heading, color: colors.textPrimary },
  sentence: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  note: { ...typography.caption, color: colors.textMuted },
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successLight,
  },
  savedText: { ...typography.caption, fontWeight: "700", color: colors.statusReady.text, flex: 1 },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
  },
  suggestionCopy: { flex: 1, gap: 2 },
  suggestionTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
});
