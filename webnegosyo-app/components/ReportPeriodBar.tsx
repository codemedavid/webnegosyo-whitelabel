import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { colors, typography, spacing, radius } from "../theme/colors";
import { ReportRangePicker } from "./ReportRangePicker";
import { describeSelection, type ReportSelection } from "../lib/report-window";

/**
 * "Which days?" — the one control every report carries.
 *
 * Each report used to own its own row of day pills, so adding a date picker
 * would have meant adding it three times and letting the three drift. This is
 * that row, plus the door to the calendar, in one place.
 *
 * The presets are deliberately unchanged and still reported as presets: they
 * are the arm that keeps working against a store whose Convex deployment is
 * behind this app (see `selectionToQueryArgs`). Only the calendar produces a
 * bounded window, so only the calendar can meet a backend that cannot serve it.
 */
interface ReportPeriodBarProps {
  selection: ReportSelection;
  /** Day counts to offer as pills, e.g. [7, 14, 30]. */
  presets: readonly number[];
  nowMs: number;
  onChange: (selection: ReportSelection) => void;
  /**
   * Offered only once dates are chosen, and only by a screen that has
   * somewhere to go back TO — the Orders tab's live queue. A screen whose
   * normal state is itself a selection (Analytics, Trends) passes neither.
   */
  onClear?: () => void;
  clearLabel?: string;
}

export function ReportPeriodBar({
  selection,
  presets,
  nowMs,
  onChange,
  onClear,
  clearLabel = "Live",
}: ReportPeriodBarProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);

  const isCustom = selection.kind !== "preset";
  const pickLabel = isCustom ? describeSelection(selection, nowMs) : "Pick dates";

  return (
    <View style={styles.row}>
      {presets.map((days) => {
        const active = selection.kind === "preset" && selection.days === days;
        const label = `${days} days`;
        return (
          <TouchableOpacity
            key={days}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange({ kind: "preset", days })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.pill, isCustom && styles.pillActive]}
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        // The label stays constant so a screen reader (and every test) can find
        // the same control whether or not dates are chosen.
        accessibilityLabel="Pick dates"
        accessibilityState={{ selected: isCustom }}
      >
        <Text style={[styles.pillText, isCustom && styles.pillTextActive]}>{pickLabel}</Text>
      </TouchableOpacity>

      {isCustom && onClear && (
        <TouchableOpacity
          style={styles.pill}
          onPress={onClear}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
        >
          <Text style={styles.pillText}>{clearLabel}</Text>
        </TouchableOpacity>
      )}

      <ReportRangePicker
        visible={isPickerOpen}
        selection={selection}
        nowMs={nowMs}
        onApply={(picked) => {
          setPickerOpen(false);
          onChange(picked);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.xl },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  pillTextActive: { color: colors.textOnDark },
});
