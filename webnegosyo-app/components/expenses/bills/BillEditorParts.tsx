import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { DayOfMonth } from "../../../lib/expenses/bill-schedule";
import { DAY_CHOICES, dayLabel } from "../../../lib/expenses/bill-editor-form";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Icon } from "../../Icon";
import { Chip } from "../AddExpenseParts";

/** A labelled block of the editor: "How often", "Remind me"… */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} accessibilityRole="header">
        {label}
      </Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

interface DayGridProps {
  selected: readonly DayOfMonth[];
  onPick: (day: DayOfMonth) => void;
  /** Spoken before each day: "Due on day". */
  prefix: string;
}

/** 1–31 and "Last day" as round cells, seven to a row like a calendar. */
export function DayGrid({ selected, onPick, prefix }: DayGridProps) {
  return (
    <View style={styles.grid}>
      {DAY_CHOICES.map((day) => {
        const isOn = selected.includes(day);
        const isLast = day === "last";
        return (
          <TouchableOpacity
            key={String(day)}
            style={[styles.day, isLast && styles.dayWide, isOn && styles.dayOn]}
            onPress={() => onPick(day)}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            accessibilityLabel={isLast ? `${prefix} the last day` : `${prefix} ${day}`}
            testID={`bill-day-${day}`}
          >
            <Text style={[styles.dayText, isOn && styles.dayTextOn]}>{dayLabel(day)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface StepperProps {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  label: string;
}

/** − 7 days before + */
export function Stepper({ value, onMinus, onPlus, label }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepButton} onPress={onMinus} accessibilityRole="button" accessibilityLabel={`Fewer: ${label}`}>
        <Icon name="minus" size={16} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.stepValue} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <TouchableOpacity style={styles.stepButton} onPress={onPlus} accessibilityRole="button" accessibilityLabel={`More: ${label}`}>
        <Icon name="plus" size={16} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

export { Chip };

const DAY_CELL = 38;

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  label: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  day: {
    width: DAY_CELL,
    height: DAY_CELL,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.surfaceSubtle,
  },
  dayWide: { width: DAY_CELL * 2 + 6, paddingHorizontal: spacing.xs },
  dayOn: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  dayText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  dayTextOn: { fontWeight: "800" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { ...typography.body, fontWeight: "700", color: colors.textPrimary, minWidth: 120, textAlign: "center" },
});
