import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  AUDIENCE_SEGMENTS,
  applyAudienceSegment,
  matchAudienceSegment,
  type AudienceSegmentId,
} from "../../../lib/sms/campaign-wizard";
import type { AudienceFilter, ExclusionReason } from "../../../lib/sms/types";
import { Icon } from "../../Icon";
import { ChoiceCard } from "./ChoiceCard";
import { StepIntro } from "./StepIntro";
import { colors, radius, spacing, typography } from "../../../theme/colors";

/**
 * Step three: who gets it.
 *
 * The old screen asked for three bare number boxes — "Not ordered in (days)",
 * "At least this many orders", "At most this many orders" — and left the
 * merchant to translate "my regulars" into them. Here the groups a restaurant
 * actually thinks in are cards, each with its live head-count, and the number
 * boxes survive as steppers under "Fine-tune" for the merchant who wants them.
 */

interface AudienceStepProps {
  filter: AudienceFilter;
  onChange: (filter: AudienceFilter) => void;
  /** Guests each card would reach right now. */
  reachBySegment: Record<AudienceSegmentId, number>;
  /** Guests the current filter reaches. */
  matchedCount: number;
  /** Everyone on the list, textable or not. */
  totalGuests: number;
  /** Why the rest of the list cannot be texted at all. */
  excludedSummary: Record<ExclusionReason, number>;
  onRecordConsent: () => void;
}

export function AudienceStep({
  filter,
  onChange,
  reachBySegment,
  matchedCount,
  totalGuests,
  excludedSummary,
  onRecordConsent,
}: AudienceStepProps) {
  const segment = matchAudienceSegment(filter);
  const [isTuning, setTuning] = useState(segment === "custom");
  const textable = reachBySegment.everyone;
  const fill = textable > 0 ? matchedCount / textable : 0;
  const cannotText = Math.max(0, totalGuests - textable);

  const setKnob = (key: keyof AudienceFilter, value: number | undefined) =>
    onChange({ ...filter, [key]: value });

  return (
    <View style={styles.wrap}>
      <StepIntro title="Who should get it?" hint="Only guests who agreed to texts are ever included." />

      <View style={styles.reach} accessibilityLiveRegion="polite">
        <View style={styles.reachHead}>
          <Text style={styles.reachNumber}>{matchedCount}</Text>
          <Text style={styles.reachLabel}>
            {matchedCount === 1 ? "guest will get this" : "guests will get this"}
          </Text>
        </View>
        <View style={styles.reachTrack}>
          <View style={[styles.reachFill, { width: `${fill * 100}%` }]} />
        </View>
        <Text style={styles.reachCaption}>
          out of {textable} {textable === 1 ? "guest" : "guests"} you can text
          {cannotText > 0 ? ` · ${cannotText} more on your list can't be texted yet` : ""}
        </Text>
        {cannotText > 0 && (
          <TouchableOpacity
            style={styles.reachLink}
            onPress={onRecordConsent}
            accessibilityRole="button"
            accessibilityLabel="Record which guests agreed to texts"
          >
            <Text style={styles.reachLinkText}>
              {excludedSummary.no_consent > 0
                ? `${excludedSummary.no_consent} haven't agreed yet — record who did`
                : "See who can't be texted"}
            </Text>
            <Icon name="arrow-right" size={14} color={colors.heroInkText} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.list} accessibilityRole="radiogroup">
        {AUDIENCE_SEGMENTS.map((candidate) => (
          <ChoiceCard
            key={candidate.id}
            title={candidate.title}
            description={candidate.description}
            isSelected={segment === candidate.id}
            onPress={() => onChange(applyAudienceSegment(filter, candidate.id))}
            trailing={String(reachBySegment[candidate.id] ?? 0)}
          />
        ))}
        {segment === "custom" && (
          <ChoiceCard
            title="Your own mix"
            description="Set with Fine-tune below"
            isSelected
            onPress={() => setTuning(true)}
            trailing={String(matchedCount)}
          />
        )}
      </View>

      <View style={styles.tune}>
        <TouchableOpacity
          style={styles.tuneHead}
          onPress={() => setTuning((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isTuning }}
        >
          <Text style={styles.tuneTitle}>Fine-tune</Text>
          <Text style={styles.tuneHint}>{isTuning ? "Hide" : "Days, order counts"}</Text>
          <Icon name={isTuning ? "chevron-down" : "chevron"} size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        {isTuning && (
          <View style={styles.knobs}>
            <FilterKnob
              label="Quiet for at least"
              unit="days"
              value={filter.lastOrderOlderThanDays}
              defaultValue={21}
              step={7}
              onChange={(value) => setKnob("lastOrderOlderThanDays", value)}
            />
            <FilterKnob
              label="Ordered within the last"
              unit="days"
              value={filter.lastOrderWithinDays}
              defaultValue={30}
              step={7}
              onChange={(value) => setKnob("lastOrderWithinDays", value)}
            />
            <FilterKnob
              label="At least"
              unit="orders"
              value={filter.minOrderCount}
              defaultValue={2}
              step={1}
              onChange={(value) => setKnob("minOrderCount", value)}
            />
            <FilterKnob
              label="At most"
              unit="orders"
              value={filter.maxOrderCount}
              defaultValue={1}
              step={1}
              onChange={(value) => setKnob("maxOrderCount", value)}
            />
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * One audience rule: off ("Any") until added, then a stepper.
 *
 * A stepper rather than a number box, because the keyboard covers half the
 * screen on a phone and a merchant adjusting "21 → 28 days" wants two taps,
 * not a keyboard round-trip.
 */
function FilterKnob({
  label,
  unit,
  value,
  defaultValue,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  defaultValue: number;
  step: number;
  onChange: (value: number | undefined) => void;
}) {
  const isOn = value !== undefined;
  const minimum = unit === "orders" ? 1 : step;

  return (
    <View style={styles.knob}>
      <Text style={[styles.knobLabel, !isOn && styles.knobLabelOff]}>{label}</Text>
      {isOn ? (
        <View style={styles.stepper}>
          <StepperButton
            icon="minus"
            label={`Fewer ${unit}`}
            disabled={value <= minimum}
            onPress={() => onChange(Math.max(minimum, value - step))}
          />
          <Text style={styles.stepperValue}>
            {value} {unit}
          </Text>
          <StepperButton
            icon="plus"
            label={`More ${unit}`}
            onPress={() => onChange(value + step)}
          />
          <TouchableOpacity
            onPress={() => onChange(undefined)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove: ${label}`}
          >
            <Icon name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addRule}
          onPress={() => onChange(defaultValue)}
          accessibilityRole="button"
          accessibilityLabel={`Add rule: ${label}`}
        >
          <Icon name="plus" size={12} color={colors.textPrimary} strokeWidth={2.25} />
          <Text style={styles.addRuleText}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StepperButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "plus" | "minus";
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.stepperButton, disabled && styles.stepperButtonOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Icon name={icon} size={14} color={colors.textPrimary} strokeWidth={2.25} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  // The answer to the step, in ink: the one number the merchant is deciding.
  reach: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  reachHead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  reachNumber: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.heroInkText,
    fontVariant: ["tabular-nums"],
  },
  reachLabel: { ...typography.body, fontWeight: "600", color: colors.heroInkText, flexShrink: 1 },
  reachTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.heroInkElevated,
    overflow: "hidden",
  },
  reachFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  reachCaption: { ...typography.caption, color: colors.heroInkMuted, lineHeight: 18 },
  reachLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 },
  reachLinkText: { ...typography.caption, color: colors.heroInkText, fontWeight: "700" },
  list: { gap: spacing.sm },
  tune: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  tuneHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  tuneTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  tuneHint: { ...typography.caption, color: colors.textSecondary },
  knobs: { borderTopWidth: 1, borderTopColor: colors.separator },
  knob: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  knobLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  knobLabelOff: { color: colors.textSecondary },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonOff: { opacity: 0.4 },
  stepperValue: {
    ...typography.caption,
    fontWeight: "800",
    color: colors.textPrimary,
    minWidth: 64,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  addRule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    minHeight: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  addRuleText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});
