import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";
import { OptionPills } from "./OptionPills";
import {
  METRIC_OPTIONS,
  SOURCE_OPTIONS,
  TOP_N_OPTIONS,
} from "../lib/product-analytics-filters";
import type { ProductMetric } from "../lib/product-daily-analytics";

export interface FilterSheetCategory {
  id: string;
  name: string;
}

export interface FilterSheetDay {
  key: string;
  label: string;
}

interface ProductFilterSheetProps {
  visible: boolean;
  onClose: () => void;

  days: readonly FilterSheetDay[];
  categories: readonly FilterSheetCategory[];

  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  categoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  sources: readonly string[];
  onToggleSource: (source: string) => void;
  metric: ProductMetric;
  onSelectMetric: (metric: ProductMetric) => void;
  topN: number | undefined;
  onSelectTopN: (topN: number | undefined) => void;

  activeCount: number;
  onReset: () => void;
}

/**
 * The five filters a merchant sets occasionally, out of the way of the ones
 * they set constantly.
 *
 * They used to stack above the numbers as six pill rows, so every session began
 * by scrolling past forty controls to reach the first peso figure. Here they
 * apply live — there is no draft to commit and no way to leave the sheet having
 * silently changed nothing — and what they did stays legible on the screen
 * behind as removable chips.
 */
export function ProductFilterSheet({
  visible,
  onClose,
  days,
  categories,
  selectedDay,
  onSelectDay,
  categoryId,
  onSelectCategory,
  sources,
  onToggleSource,
  metric,
  onSelectMetric,
  topN,
  onSelectTopN,
  activeCount,
  onReset,
}: ProductFilterSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity
              onPress={onReset}
              disabled={activeCount === 0}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
              accessibilityState={{ disabled: activeCount === 0 }}
            >
              <Text style={[styles.reset, activeCount === 0 && styles.resetDisabled]}>
                Reset
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {days.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>One day only</Text>
                <Text style={styles.sectionHint}>
                  Days with sales. Tap the same day again to go back to the period.
                </Text>
                <OptionPills
                  options={days.map((day) => ({
                    label: day.label,
                    value: day.key as string | null,
                  }))}
                  isSelected={(value) => selectedDay === value}
                  onSelect={(value) => onSelectDay(selectedDay === value ? null : value)}
                  accessibilityPrefix="Show only"
                />
              </View>
            )}

            {categories.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Category</Text>
                <OptionPills
                  options={[
                    { label: "All", value: null as string | null },
                    ...categories.map((c) => ({
                      label: c.name,
                      value: c.id as string | null,
                    })),
                  ]}
                  isSelected={(value) => categoryId === value}
                  onSelect={onSelectCategory}
                  accessibilityPrefix="Category"
                />
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Where it was ordered</Text>
              <Text style={styles.sectionHint}>
                Pick any. Nothing picked counts every channel.
              </Text>
              <OptionPills
                options={SOURCE_OPTIONS}
                isSelected={(value) => sources.includes(value)}
                onSelect={onToggleSource}
                accessibilityPrefix="Include"
                mode="multi"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Rank by</Text>
              <OptionPills
                options={METRIC_OPTIONS}
                isSelected={(value) => metric === value}
                onSelect={onSelectMetric}
                accessibilityPrefix="Rank by"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Products per day</Text>
              <OptionPills
                options={TOP_N_OPTIONS}
                isSelected={(value) => topN === value}
                onSelect={onSelectTopN}
                accessibilityPrefix="Show"
              />
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.done}
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Done, show results"
          >
            <Text style={styles.doneText}>Show results</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(29,24,21,0.45)" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 40,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  title: { ...typography.title, color: colors.textPrimary },
  // Ink rather than the coral accent, which measures 3.1:1 on this ground.
  // Disabled text is exempt from the contrast minimum and reads as unavailable.
  reset: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  resetDisabled: { color: colors.textTertiary },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingTop: spacing.lg, paddingBottom: spacing.sm },

  // Generous above, tight within: each group reads as one decision rather than
  // the undifferentiated wall the six stacked rows made.
  section: { marginBottom: spacing.xxl },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  // Hierarchy by size and weight, not by a grey that measures 3.1:1 here: the
  // title is 17/700 above this 13/400.
  sectionHint: {
    ...typography.caption,
    color: colors.textPrimary,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },

  done: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
  },
  doneText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});
