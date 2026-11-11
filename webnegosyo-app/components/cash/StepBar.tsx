import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

export interface StepBarStep {
  key: string;
  /** "Count cash" */
  label: string;
  /** Shown instead of the label once done, e.g. "None today" for a skipped step. */
  doneLabel?: string;
}

interface StepBarProps {
  steps: readonly StepBarStep[];
  /** 0-based index of the step on screen. Earlier steps read as done. */
  currentIndex: number;
  /** Force the one-line form; it is also used automatically at large text sizes. */
  isCompact?: boolean;
}

/** Above this font scale the dots don't fit; the bar becomes "Step 2 of 4 · GCash & cards" (06 §9). */
export const COMPACT_FONT_SCALE = 1.3;

/**
 * "1 Count cash · 2 GCash & cards · 3 Result · 4 Remit": numbered dots, the
 * current step in ink, done steps ticked. A screen reader hears the step and
 * where it is ("Step 2 of 4, GCash & cards, current").
 */
export function StepBar({ steps, currentIndex, isCompact }: StepBarProps) {
  const { fontScale } = useWindowDimensions();
  const current = steps[Math.min(Math.max(currentIndex, 0), steps.length - 1)];
  if (!current) return null;
  const position = `Step ${currentIndex + 1} of ${steps.length}`;

  if (isCompact ?? fontScale >= COMPACT_FONT_SCALE) {
    return (
      <View style={styles.compact} accessibilityRole="header" testID="step-bar">
        <Text style={styles.compactText}>{`${position} · ${current.label}`}</Text>
      </View>
    );
  }

  return (
    <View style={styles.bar} accessibilityRole="progressbar" accessibilityLabel={`${position}, ${current.label}`} testID="step-bar">
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const state = isDone ? "done" : isCurrent ? "current" : "to do";
        return (
          <View
            key={step.key}
            style={styles.step}
            accessible
            accessibilityLabel={`Step ${index + 1} of ${steps.length}, ${step.label}, ${state}`}
            testID={`step-${step.key}`}
          >
            <View style={[styles.dot, isCurrent && styles.dotCurrent, isDone && styles.dotDone]}>
              {isDone ? (
                <Icon name="check" size={13} color={colors.textOnDark} strokeWidth={2.5} />
              ) : (
                <Text style={[styles.dotText, isCurrent && styles.dotTextCurrent]}>{index + 1}</Text>
              )}
            </View>
            <Text style={[styles.label, isCurrent && styles.labelCurrent]} numberOfLines={1}>
              {isDone && step.doneLabel ? step.doneLabel : step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 22;

const styles = StyleSheet.create({
  bar: { flexDirection: "row", gap: spacing.sm },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotText: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  dotTextCurrent: { color: colors.textOnDark },
  label: { ...typography.caption, flexShrink: 1, color: colors.textMuted, fontWeight: "600" },
  labelCurrent: { color: colors.textPrimary, fontWeight: "800" },
  compact: { paddingVertical: 4 },
  compactText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});
