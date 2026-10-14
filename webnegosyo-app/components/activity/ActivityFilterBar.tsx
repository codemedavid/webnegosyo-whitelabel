import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  activeQuickFilter,
  filterChips,
  quickFilterOptions,
  sheetFilterCount,
  type ActivityFilters,
  type FilterChipKey,
  type QuickFilter,
  type QuickFilterViewer,
} from "../../lib/activity/filters";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { FilterChipsRow } from "../FilterChipsRow";
import { Icon } from "../Icon";

/** 40pt pills + 4pt above and below = the 48dp target (spec P6). */
const PILL_HIT_SLOP = { top: 4, bottom: 4, left: 2, right: 2 };

interface ActivityFilterBarProps {
  filters: ActivityFilters;
  viewer: QuickFilterViewer;
  outletName: (outletId: string) => string | null;
  onQuick: (value: QuickFilter) => void;
  onOpenSheet: () => void;
  onRemoveChip: (key: FilterChipKey) => void;
  onClearAll: () => void;
}

/**
 * Quick chips in one scrolling row (they switch often; the full set lives in
 * the sheet), then the sheet's filters echoed as removable chips (spec §3.1).
 */
export function ActivityFilterBar({
  filters,
  viewer,
  outletName,
  onQuick,
  onOpenSheet,
  onRemoveChip,
  onClearAll,
}: ActivityFilterBarProps) {
  const selected = activeQuickFilter(filters);
  const count = sheetFilterCount(filters);
  const chips = filterChips(filters, { outletName }).map((chip) => ({ id: chip.key, label: chip.label }));

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {quickFilterOptions(viewer).map((option) => {
          const isOn = selected === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.pill, isOn && styles.pillOn]}
              onPress={() => onQuick(option.value)}
              hitSlop={PILL_HIT_SLOP}
              accessibilityRole="button"
              accessibilityState={{ selected: isOn }}
              accessibilityLabel={`Show ${option.label}`}
            >
              <Text style={[styles.pillText, isOn && styles.pillTextOn]} numberOfLines={1}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.pill, styles.filterPill, count > 0 && styles.pillOn]}
          onPress={onOpenSheet}
          hitSlop={PILL_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `More filters, ${count} on` : "More filters"}
        >
          <Icon name="list" size={14} color={count > 0 ? colors.textOnDark : colors.textPrimary} />
          <Text style={[styles.pillText, count > 0 && styles.pillTextOn]}>{count > 0 ? `Filter · ${count}` : "Filter"}</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={styles.chips}>
        <FilterChipsRow chips={chips} onRemove={(chip) => onRemoveChip(chip.id)} onClearAll={onClearAll} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: spacing.sm },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  pill: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  filterPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  pillTextOn: { color: colors.textOnDark },
  chips: { paddingHorizontal: spacing.lg },
});
