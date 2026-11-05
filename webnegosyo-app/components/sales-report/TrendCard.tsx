import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMetric, formatMetricShort } from "../../lib/sales-report/format";
import { buildTrend, labelledBarIndexes, trendMetrics } from "../../lib/sales-report/overview-view";
import type { MetricDef, MetricId, ReportGrain, ReportRow } from "../../lib/sales-report/types";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { SegmentedControl } from "../SegmentedControl";

const CHART_HEIGHT = 140;
const GRAIN_TITLES: Readonly<Record<ReportGrain, string>> = {
  hour: "By hour",
  day: "By day",
  week: "By week",
  month: "By month",
};

interface TrendCardProps {
  rows: readonly ReportRow[];
  metrics: readonly MetricDef[];
  grain: ReportGrain;
  compareLabel: string | null;
  /** The last bar is still running ("so far"). */
  isPartial: boolean;
}

/**
 * Sales over time: one bar per hour, day, week or month, with the compared
 * period as a thin grey mark. Tap a bar to read it. A screen reader gets the
 * busiest and the latest bar in words instead of the drawing.
 */
export function TrendCard({ rows, metrics, grain, compareLabel, isPartial }: TrendCardProps) {
  const options = trendMetrics(rows, metrics);
  const [metricId, setMetricId] = useState<MetricId>(options[0]?.id ?? "net_sales");
  const metric = options.find((option) => option.id === metricId) ?? options[0];
  const [selected, setSelected] = useState<number | null>(null);
  if (!metric) return null;

  const trend = buildTrend(rows, metric);
  // First, middle and last bar: names that fit under any number of bars.
  const axisLabels = [...labelledBarIndexes(trend.bars.length, 2)].map((index) => shortLabel(trend.bars[index].label, grain));
  const focus = selected !== null ? trend.bars[selected] : trend.bars[trend.bars.length - 1];
  const busiest = trend.bars.reduce((best, bar) => (bar.value > (best?.value ?? -Infinity) ? bar : best), trend.bars[0]);
  const summary = busiest
    ? `${metric.label} ${GRAIN_TITLES[grain].toLowerCase()}. Highest ${busiest.label}, ${formatMetric(busiest.value, metric.format)}.`
    : `${metric.label}: nothing yet.`;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{GRAIN_TITLES[grain]}</Text>
        {compareLabel ? <Text style={styles.legend}>{`▍ ${compareLabel}`}</Text> : null}
      </View>
      {options.length > 1 ? (
        <SegmentedControl
          options={options.map((option) => ({ label: option.label, value: option.id }))}
          value={metric.id}
          onChange={(id) => {
            setMetricId(id);
            setSelected(null);
          }}
          accessibilityPrefix="Chart shows"
        />
      ) : null}
      {focus ? (
        <View style={styles.readout} accessibilityLiveRegion="polite">
          <Text style={styles.readoutLabel}>{focus.label}{isPartial && focus === trend.bars[trend.bars.length - 1] ? " · so far" : ""}</Text>
          <Text style={styles.readoutValue}>{formatMetric(focus.value, metric.format)}</Text>
          {focus.previous !== null ? (
            <Text style={styles.readoutLabel}>{`${formatMetric(focus.previous, metric.format)} ${compareLabel ?? "before"}`}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.chart} accessible accessibilityLabel={summary}>
        {trend.bars.map((bar, index) => {
          const height = trend.max > 0 ? Math.max(2, (bar.value / trend.max) * CHART_HEIGHT) : 2;
          const mark = bar.previous !== null && trend.max > 0 ? (bar.previous / trend.max) * CHART_HEIGHT : null;
          const isOn = selected === index;
          return (
            <Pressable key={bar.key} style={styles.column} onPress={() => setSelected(isOn ? null : index)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.track}>
                {mark !== null ? <View style={[styles.mark, { bottom: mark }]} /> : null}
                <View style={[styles.bar, { height }, isOn && styles.barOn]} />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axisRow} importantForAccessibility="no-hide-descendants">
        {axisLabels.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.axis} numberOfLines={1}>
            {label}
          </Text>
        ))}
      </View>
      <Text style={styles.scale}>{`Highest bar ${formatMetricShort(trend.max, metric.format)}`}</Text>
    </View>
  );
}

function shortLabel(label: string, grain: ReportGrain): string {
  if (grain === "month") return label.slice(0, 3);
  if (grain === "week") return label.replace("Week of ", "");
  return label;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...typography.heading, color: colors.textPrimary },
  legend: { ...typography.caption, color: colors.textMuted },
  readout: { gap: 2 },
  readoutLabel: { ...typography.caption, color: colors.textMuted },
  readoutValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  column: { flex: 1, alignItems: "center" },
  track: { height: CHART_HEIGHT, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.primary, opacity: 0.85 },
  barOn: { backgroundColor: colors.accent, opacity: 1 },
  mark: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: colors.textTertiary },
  axisRow: { flexDirection: "row", justifyContent: "space-between" },
  axis: { ...typography.small, color: colors.textMuted },
  scale: { ...typography.small, color: colors.textMuted },
});
