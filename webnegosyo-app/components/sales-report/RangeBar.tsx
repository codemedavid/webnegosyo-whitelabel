import React, { useRef } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COMPARE_OPTIONS, OVERVIEW_PRESETS } from "../../lib/sales-report/overview-view";
import type { CompareTo, ReportOption, ReportPreset } from "../../lib/sales-report/types";
import { colors, radius, spacing, typography } from "../../theme/colors";

/** Chips are drawn 36pt tall; this makes the tap target the 44pt minimum. */
const CHIP_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

interface ChipRowProps<T extends string> {
  options: readonly { label: string; value: T }[];
  value: T | null;
  onPick: (value: T) => void;
  accessibilityPrefix: string;
  isQuiet?: boolean;
}

/** Room left of a chip scrolled into view, so the one before it peeks in. */
const SCROLL_PEEK = 24;

function ChipRow<T extends string>({ options, value, onPick, accessibilityPrefix, isQuiet = false }: ChipRowProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolled = useRef(false);
  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const isOn = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.chip, isQuiet && styles.chipQuiet, isOn && styles.chipOn]}
            onPress={() => onPick(option.value)}
            // The chosen chip starts in view, even when it sits past the screen edge.
            onLayout={(event) => {
              if (!isOn || hasScrolled.current) return;
              hasScrolled.current = true;
              scrollRef.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - SCROLL_PEEK), animated: false });
            }}
            hitSlop={CHIP_HIT_SLOP}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected: isOn }}
            accessibilityLabel={`${accessibilityPrefix} ${option.label}`}
          >
            <Text style={[styles.chipText, isOn && styles.chipTextOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

interface RangeBarProps {
  preset: ReportPreset;
  /** "Custom" opens the calendar, also when it is already on. */
  onPickPreset: (preset: ReportPreset) => void;
  compare: CompareTo;
  onPickCompare: (compare: CompareTo) => void;
  /** Branch choices for a store-wide account in a multi-branch store; null = no picker. */
  branches: ReportOption[] | null;
  branch: string | null;
  onPickBranch: (branch: string | null) => void;
  /** A branch-locked account sees its branch, fixed. */
  lockedBranchLabel: string | null;
  /** What the chosen period actually covers: "Oct 1 – 14". */
  periodLabel: string | null;
}

const ALL_BRANCHES = "__all__";

/** Which days, compared with what, for which branch: the one control on top of every report. */
export function RangeBar({
  preset,
  onPickPreset,
  compare,
  onPickCompare,
  branches,
  branch,
  onPickBranch,
  lockedBranchLabel,
  periodLabel,
}: RangeBarProps) {
  const branchOptions = branches ? [{ label: "All branches", value: ALL_BRANCHES }, ...branches.map((option) => ({ label: option.label, value: option.value }))] : null;
  return (
    <View style={styles.wrap}>
      <ChipRow options={OVERVIEW_PRESETS} value={preset} onPick={onPickPreset} accessibilityPrefix="Period" />
      <View style={styles.metaRow}>
        <ChipRow options={COMPARE_OPTIONS} value={compare} onPick={onPickCompare} accessibilityPrefix="Compare" isQuiet />
      </View>
      {branchOptions ? (
        <ChipRow
          options={branchOptions}
          value={branch ?? ALL_BRANCHES}
          onPick={(value) => onPickBranch(value === ALL_BRANCHES ? null : value)}
          accessibilityPrefix="Branch"
          isQuiet
        />
      ) : null}
      {lockedBranchLabel || periodLabel ? (
        <Text style={styles.caption} numberOfLines={1}>
          {[periodLabel, lockedBranchLabel].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { gap: spacing.sm, paddingVertical: CHIP_HIT_SLOP.top },
  metaRow: { flexDirection: "row" },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  chipQuiet: { minHeight: 32, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSubtle },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  chipTextOn: { color: colors.textOnDark, fontWeight: "700" },
  caption: { ...typography.caption, color: colors.textMuted },
});
