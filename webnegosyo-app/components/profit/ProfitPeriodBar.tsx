import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ProfitPreset } from "../../lib/profit/profit-period";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { SegmentedControl } from "../SegmentedControl";

const PERIODS: readonly { label: string; value: ProfitPreset }[] = [
  { label: "This week", value: "this_week" },
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
  { label: "Pick", value: "custom" },
];

export interface BranchPill {
  key: string;
  label: string;
  isOn: boolean;
  onPress: () => void;
}

interface ProfitPeriodBarProps {
  preset: ProfitPreset;
  /** A preset was tapped; "custom" means open the day picker (also when it is already on). */
  onPick: (preset: ProfitPreset) => void;
  /** Round branch pills, only for a store-wide account in a multi-branch store. */
  branches: readonly BranchPill[] | null;
}

/** Which days (and which branch) the profit covers. */
export function ProfitPeriodBar({ preset, onPick, branches }: ProfitPeriodBarProps) {
  return (
    <View style={styles.wrap}>
      <SegmentedControl options={PERIODS} value={preset} onChange={onPick} accessibilityPrefix="Period" />
      {branches ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {branches.map((pill) => (
            <TouchableOpacity
              key={pill.key}
              style={[styles.pill, pill.isOn && styles.pillOn]}
              onPress={pill.onPress}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected: pill.isOn }}
              accessibilityLabel={`Branch ${pill.label}`}
            >
              <Text style={[styles.pillText, pill.isOn && styles.pillTextOn]} numberOfLines={1}>
                {pill.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  pills: { gap: spacing.sm, paddingVertical: 2 },
  pill: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  pillTextOn: { color: colors.textOnDark, fontWeight: "700" },
});
