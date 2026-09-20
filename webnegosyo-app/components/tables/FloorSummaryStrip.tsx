import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { OptionPills } from "../OptionPills";
import { TABLE_STATUSES, type FloorSummary, type TableStatus } from "../../lib/tables/table-floor";
import { tableStatusLabel } from "../../lib/tables/table-copy";
import { STATUS_TONES } from "./floor-tokens";

export type FloorFilter = TableStatus | "all";

interface FloorSummaryStripProps {
  summary: FloorSummary;
  filter: FloorFilter;
  onFilter: (filter: FloorFilter) => void;
}

/**
 * The numbers a host reads first, then the filter that dims the rest of the
 * floor. Filtering never removes a node — the floor is a map, and a map that
 * rearranges itself is not one.
 */
export function FloorSummaryStrip({ summary, filter, onFilter }: FloorSummaryStripProps) {
  const occupied = summary.total - summary.byStatus.available;
  const options: { label: string; value: FloorFilter }[] = [
    { label: `All ${summary.total}`, value: "all" },
    ...TABLE_STATUSES.map((status) => ({
      label: `${tableStatusLabel(status)} ${summary.byStatus[status]}`,
      value: status as FloorFilter,
    })),
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.figures}>
        <Figure value={occupied} caption="seated" />
        <Figure value={summary.covers} caption="guests" />
        <Figure value={summary.byStatus.available} caption="free" />
        <Figure value={summary.seatsFree} caption="open seats" />
      </View>
      <OptionPills<FloorFilter>
        options={options}
        isSelected={(value) => value === filter}
        onSelect={onFilter}
        accessibilityPrefix="Show"
      />
      <View style={styles.legend}>
        {TABLE_STATUSES.map((status) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: STATUS_TONES[status].ring }]} />
            <Text style={styles.legendText}>{tableStatusLabel(status)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Figure({ value, caption }: { value: number; caption: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureCaption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  figures: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  figure: { flex: 1, alignItems: "center" },
  figureValue: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  figureCaption: { ...typography.small, color: colors.textSecondary, fontWeight: "600", marginTop: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: radius.full },
  legendText: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
});
