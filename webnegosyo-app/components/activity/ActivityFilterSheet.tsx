import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import { activityFiltersReducer, DEFAULT_ACTIVITY_FILTERS, PERIOD_LABELS, type ActivityFilters, type ActivityPeriod } from "../../lib/activity/filters";
import { ACTIVITY_CATEGORIES, CATEGORY_LABELS, type ActivityCategory } from "../../lib/activity/taxonomy";
import { resolveReportWindow, type ReportSelection } from "../../lib/report-window";
import { colors, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";
import { OptionPills } from "../OptionPills";
import { ReportRangePicker } from "../ReportRangePicker";

export interface ActivityPersonOption {
  id: string;
  name: string;
}

export interface ActivityOutletOption {
  id: string;
  name: string;
}

interface ActivityFilterSheetProps {
  visible: boolean;
  filters: ActivityFilters;
  /** Who and Kind's Team are for the store view only. */
  isFullViewer: boolean;
  isOwner: boolean;
  people: readonly ActivityPersonOption[];
  /** Branches a store-wide account may narrow to; empty hides the group. */
  outlets: readonly ActivityOutletOption[];
  /** A branch-locked account's branch, shown as a static line. */
  lockedBranchName: string | null;
  nowMs: number;
  onApply: (filters: ActivityFilters) => void;
  onClose: () => void;
}

const PERIODS: readonly ActivityPeriod[] = ["today", "yesterday", "last7", "month"];
const LAST_WEEK_DAYS = 7;

/**
 * Everything the quick chips do not cover (spec §3.2). Changes stay a draft
 * until "Show events" — closing the sheet changes nothing.
 */
export function ActivityFilterSheet({
  visible,
  filters,
  isFullViewer,
  isOwner,
  people,
  outlets,
  lockedBranchName,
  nowMs,
  onApply,
  onClose,
}: ActivityFilterSheetProps) {
  const [draft, setDraft] = useState<ActivityFilters>(filters);
  const [isPickingDates, setPickingDates] = useState(false);

  // Each opening starts from what the feed shows now.
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const categories = ACTIVITY_CATEGORIES.filter((category) => category !== "team" || isOwner);
  const pickDates = (selection: ReportSelection) => {
    const window = resolveReportWindow(selection, nowMs);
    const range = { since: new Date(window.startMs).toISOString(), until: new Date(window.endMs).toISOString() };
    setDraft((current) => activityFiltersReducer(current, { type: "setPeriod", period: "custom", range }));
    setPickingDates(false);
  };

  return (
    <DrawerSheet visible={visible} title="Filters" onClose={onClose}>
      <View style={styles.group}>
        <Text style={styles.groupTitle}>When</Text>
        <OptionPills
          options={[
            ...PERIODS.map((period) => ({ label: PERIOD_LABELS[period], value: period })),
            { label: draft.period === "custom" ? "Picked dates" : "Pick dates…", value: "custom" as ActivityPeriod },
          ]}
          isSelected={(value) => draft.period === value}
          onSelect={(value) =>
            value === "custom"
              ? setPickingDates(true)
              : setDraft((current) => activityFiltersReducer(current, { type: "setPeriod", period: value }))
          }
          accessibilityPrefix="Show"
        />
      </View>

      {isFullViewer && people.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Who</Text>
          <OptionPills
            options={[{ label: "Everyone", value: null as ActivityPersonOption | null }, ...people.map((person) => ({ label: person.name, value: person as ActivityPersonOption | null }))]}
            isSelected={(value) => (value === null ? draft.actor === null : draft.actor?.id === value.id)}
            onSelect={(value) => setDraft((current) => activityFiltersReducer(current, { type: "setActor", actor: value }))}
            accessibilityPrefix="Show activity by"
          />
        </View>
      ) : null}

      {lockedBranchName ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Branch</Text>
          <Text style={styles.static}>{lockedBranchName} only</Text>
        </View>
      ) : outlets.length > 1 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Branch</Text>
          <OptionPills
            options={[{ label: "All branches", value: null as string | null }, ...outlets.map((outlet) => ({ label: outlet.name, value: outlet.id as string | null }))]}
            isSelected={(value) => draft.outletId === value}
            onSelect={(value) => setDraft((current) => activityFiltersReducer(current, { type: "setOutlet", outletId: value }))}
            accessibilityPrefix="Branch"
          />
        </View>
      ) : null}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Kind</Text>
        <Text style={styles.hint}>Pick any. Nothing picked shows every kind.</Text>
        <OptionPills
          options={categories.map((category) => ({ label: CATEGORY_LABELS[category], value: category }))}
          isSelected={(value: ActivityCategory) => draft.categories.includes(value)}
          onSelect={(value) => setDraft((current) => activityFiltersReducer(current, { type: "toggleCategory", category: value }))}
          accessibilityPrefix="Include"
          mode="multi"
        />
      </View>

      <View style={[styles.group, styles.switchRow]}>
        <View style={styles.switchCopy}>
          <Text style={styles.groupTitle}>Show routine events</Text>
          <Text style={styles.hint}>Every order placed, stamp earned and payment taken.</Text>
        </View>
        <Switch
          value={draft.includeRoutine}
          onValueChange={(value) => setDraft((current) => activityFiltersReducer(current, { type: "setIncludeRoutine", value }))}
          accessibilityLabel="Show routine events"
        />
      </View>

      <View style={styles.dock}>
        <TouchableOpacity
          onPress={() => setDraft({ ...DEFAULT_ACTIVITY_FILTERS, search: draft.search, subject: draft.subject })}
          style={styles.reset}
          accessibilityRole="button"
          accessibilityLabel="Reset filters"
        >
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
        <Button label="Show events" onPress={() => onApply(draft)} style={styles.apply} />
      </View>

      <ReportRangePicker
        visible={isPickingDates}
        selection={{ kind: "preset", days: LAST_WEEK_DAYS }}
        nowMs={nowMs}
        onApply={pickDates}
        onClose={() => setPickingDates(false)}
      />
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: spacing.xl },
  groupTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.xs, marginBottom: spacing.sm },
  static: { ...typography.body, color: colors.textPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchCopy: { flex: 1 },
  dock: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  reset: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md },
  resetText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  apply: { flex: 1 },
});
