import React, { useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";

import { colors, typography, spacing, radius } from "../theme/colors";
import { ReportRangePicker } from "./ReportRangePicker";
import { describeSelection, isSameSelection, type ReportQuickPick, type ReportSelection } from "../lib/report-window";
import { MIDNIGHT_SCHEDULE, type CutoffSchedule } from "../lib/business-day/trading-day";

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
  /** The store's business-day cutoffs (`useReportWindow().schedule`); none = Manila midnight. */
  schedule?: CutoffSchedule;
  onChange: (selection: ReportSelection) => void;
  /**
   * Offered only once dates are chosen, and only by a screen that has
   * somewhere to go back TO — the Orders tab's live queue. A screen whose
   * normal state is itself a selection (Analytics, Trends) passes neither.
   */
  onClear?: () => void;
  clearLabel?: string;
  /**
   * One-tap picked days (Order History: Today · Yesterday · Last 7 days ·
   * This month). With these the bar becomes one scrolling chip row: the
   * way back (`onClear`) is always the first chip, active while no dates are
   * picked, and the calendar is the last chip, named `customLabel`.
   */
  quickPicks?: readonly ReportQuickPick[];
  /** The calendar chip's word while no custom dates are shown. */
  customLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Chips grow to a 44 pt touch target without looking taller than the others. */
const CHIP_HIT_SLOP = { top: 6, bottom: 6, left: 2, right: 2 } as const;

interface ChipProps {
  label: string;
  accessibilityLabel?: string;
  isActive: boolean;
  onPress: () => void;
}

function Chip({ label, accessibilityLabel = label, isActive, onPress }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.pill, styles.chip, isActive && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={CHIP_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive }}
    >
      <Text style={[styles.pillText, isActive && styles.pillTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function ReportPeriodBar({
  selection,
  presets,
  nowMs,
  schedule = MIDNIGHT_SCHEDULE,
  onChange,
  onClear,
  clearLabel = "Live",
  quickPicks,
  customLabel = "Pick dates",
  style,
}: ReportPeriodBarProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  const chipRowRef = useRef<ScrollView>(null);

  const isCustom = selection.kind !== "preset";
  const pickLabel = isCustom ? describeSelection(selection, nowMs, schedule) : "Pick dates";

  const picker = (
    <ReportRangePicker
      visible={isPickerOpen}
      selection={selection}
      nowMs={nowMs}
      schedule={schedule}
      onApply={(picked) => {
        setPickerOpen(false);
        onChange(picked);
      }}
      onClose={() => setPickerOpen(false)}
    />
  );

  if (quickPicks && quickPicks.length > 0) {
    const isDated = selection.kind !== "preset";
    const matches = quickPicks.filter((pick) => isDated && isSameSelection(pick.selection, selection));
    const isCustomActive = isDated && matches.length === 0;
    return (
      <View style={style}>
        <ScrollView
          ref={chipRowRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          // Picked dates turn the last chip ("Custom") into "Sep 1 – Sep 30":
          // the row grows under a fixed offset and the chip ends cut at the
          // gutter. Keep the active last chip in view.
          onContentSizeChange={() => {
            if (isCustomActive) chipRowRef.current?.scrollToEnd({ animated: false });
          }}
        >
          {onClear ? <Chip label={clearLabel} isActive={!isDated} onPress={onClear} /> : null}
          {quickPicks.map((pick) => (
            <Chip
              key={pick.key}
              label={pick.label}
              isActive={matches.includes(pick)}
              onPress={() => onChange(pick.selection)}
            />
          ))}
          <Chip
            label={isCustomActive ? describeSelection(selection, nowMs, schedule) : customLabel}
            // Constant, like the plain bar's: the same control whatever it shows.
            accessibilityLabel="Pick dates"
            isActive={isCustomActive}
            onPress={() => setPickerOpen(true)}
          />
        </ScrollView>
        {picker}
      </View>
    );
  }

  return (
    <View style={[styles.row, style]}>
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

      {picker}
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
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.xl },
  chip: { minHeight: 34, justifyContent: "center" },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  pillTextActive: { color: colors.textOnDark },
});
