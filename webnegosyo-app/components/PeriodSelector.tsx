import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";

interface Period {
  label: string;
  value: string;
}

interface PeriodSelectorProps {
  periods: Period[];
  selected: string;
  onSelect: (value: string) => void;
}

export function PeriodSelector({ periods, selected, onSelect }: PeriodSelectorProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {periods.map((period) => (
        <TouchableOpacity
          key={period.value}
          style={[styles.pill, selected === period.value && styles.pillActive]}
          onPress={() => onSelect(period.value)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, selected === period.value && styles.pillTextActive]}>
            {period.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingBottom: spacing.md },
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
  pillTextActive: { color: "#FFFFFF" },
});
