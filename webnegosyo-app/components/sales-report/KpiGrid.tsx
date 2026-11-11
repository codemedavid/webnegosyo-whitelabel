import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { describeChange, formatMetric, type ChangeTone } from "../../lib/sales-report/format";
import type { MetricDef, MetricValues } from "../../lib/sales-report/types";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

const TONE_COLOR: Readonly<Record<ChangeTone, string>> = {
  good: colors.success,
  bad: colors.danger,
  neutral: colors.textMuted,
};

interface KpiCardProps {
  metric: MetricDef;
  value: number | null | undefined;
  previous: number | null | undefined;
  /** Null = not comparing: no change line at all. */
  comparePhrase: string | null;
  isHero: boolean;
  onPress: () => void;
}

function KpiCard({ metric, value, previous, comparePhrase, isHero, onPress }: KpiCardProps) {
  const change = comparePhrase ? describeChange(value, previous, metric) : null;
  const valueText = formatMetric(value, metric.format);
  return (
    <TouchableOpacity
      style={[styles.card, isHero ? styles.hero : styles.tile]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${metric.label}, ${valueText}${change ? `, ${change.text} ${comparePhrase}` : ""}. Tap for what it means.`}
    >
      <View style={styles.labelRow}>
        <Text style={[styles.label, isHero && styles.heroMuted]} numberOfLines={1}>
          {metric.label}
        </Text>
        <Icon name="info" size={14} color={isHero ? colors.heroInkMuted : colors.textTertiary} />
      </View>
      <Text style={[styles.value, isHero && styles.heroValue]} numberOfLines={1} adjustsFontSizeToFit>
        {valueText}
      </Text>
      {change ? (
        <Text style={[styles.change, { color: isHero ? heroTone(change.tone) : TONE_COLOR[change.tone] }]} numberOfLines={2}>
          {change.text}
          <Text style={[styles.changeMuted, isHero && styles.heroMuted]}>{` ${comparePhrase}`}</Text>
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function heroTone(tone: ChangeTone): string {
  if (tone === "good") return colors.heroInkPositive;
  if (tone === "bad") return colors.heroInkNegative;
  return colors.heroInkMuted;
}

interface KpiGridProps {
  cards: readonly MetricDef[];
  current: MetricValues;
  previous: MetricValues | null;
  comparePhrase: string | null;
  onOpen: (metric: MetricDef) => void;
  onEdit: () => void;
}

/** The figures the owner chose to track: the first one large on ink, the rest two to a row. */
export function KpiGrid({ cards, current, previous, comparePhrase, onOpen, onEdit }: KpiGridProps) {
  const [first, ...rest] = cards;
  return (
    <View style={styles.grid}>
      {first ? (
        <KpiCard
          metric={first}
          value={current[first.id]}
          previous={previous?.[first.id]}
          comparePhrase={previous ? comparePhrase : null}
          isHero
          onPress={() => onOpen(first)}
        />
      ) : null}
      <View style={styles.pairs}>
        {rest.map((metric) => (
          <View key={metric.id} style={styles.cell}>
            <KpiCard
              metric={metric}
              value={current[metric.id]}
              previous={previous?.[metric.id]}
              comparePhrase={previous ? comparePhrase : null}
              isHero={false}
              onPress={() => onOpen(metric)}
            />
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.edit} onPress={onEdit} accessibilityRole="button" accessibilityLabel="Choose which figures to track">
        <Icon name="edit" size={16} color={colors.textPrimary} />
        <Text style={styles.editText}>Choose what you track</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  pairs: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -spacing.xs },
  cell: { width: "50%", padding: spacing.xs, flexDirection: "row" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, minHeight: 108, ...shadow.sm },
  tile: { flex: 1 },
  hero: { backgroundColor: colors.heroInk, minHeight: 0, paddingVertical: spacing.xl },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  label: { ...typography.caption, fontWeight: "600", color: colors.textMuted, flexShrink: 1 },
  value: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  heroValue: { fontSize: 34, color: colors.heroInkText },
  heroMuted: { color: colors.heroInkMuted },
  change: { ...typography.caption, fontWeight: "700" },
  changeMuted: { fontWeight: "400", color: colors.textMuted },
  edit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
  },
  editText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
});
