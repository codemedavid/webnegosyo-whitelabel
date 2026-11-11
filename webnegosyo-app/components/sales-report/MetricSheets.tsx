import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { MAX_CARDS, moveCard, toggleCard } from "../../lib/sales-report/cards";
import { describeChange, formatMetric } from "../../lib/sales-report/format";
import type { MetricDef, MetricId } from "../../lib/sales-report/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { BottomSheet } from "./BottomSheet";

interface MetricInfoSheetProps {
  metric: MetricDef | null;
  value: number | null | undefined;
  previous: number | null | undefined;
  /** "last month", "the same days last year"; null = not comparing. */
  compareLabel: string | null;
  periodLabel: string;
  onClose: () => void;
}

/** "What is this number?" — the definition, in plain words, with the store's own figure. */
export function MetricInfoSheet({ metric, value, previous, compareLabel, periodLabel, onClose }: MetricInfoSheetProps) {
  if (!metric) return null;
  const change = compareLabel ? describeChange(value, previous, metric) : null;
  return (
    <BottomSheet visible title={metric.label} onClose={onClose}>
      <Text style={styles.hint}>{metric.hint}</Text>
      <View style={styles.figure}>
        <Text style={styles.figureLabel}>{periodLabel}</Text>
        <Text style={styles.figureValue}>{formatMetric(value, metric.format)}</Text>
        {change && previous !== null && previous !== undefined ? (
          <Text style={styles.figureLabel}>{`${formatMetric(previous, metric.format)} ${compareLabel} · ${change.text}`}</Text>
        ) : null}
      </View>
      <Text style={styles.definition}>{metric.definition}</Text>
      {metric.permission === "costs" ? (
        <Text style={styles.note}>Only people with cost access see this figure.</Text>
      ) : null}
    </BottomSheet>
  );
}

interface EditCardsSheetProps {
  visible: boolean;
  chosen: readonly MetricId[];
  choices: readonly MetricDef[];
  onChange: (cards: MetricId[]) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Pick the figures on top of the report, and their order. The first one is drawn large. */
export function EditCardsSheet({ visible, chosen, choices, onChange, onReset, onClose }: EditCardsSheetProps) {
  const byId = new Map(choices.map((metric) => [metric.id, metric]));
  const picked = chosen.flatMap((id) => byId.get(id) ?? []);
  const others = choices.filter((metric) => !chosen.includes(metric.id));
  const isFull = picked.length >= MAX_CARDS;
  return (
    <BottomSheet
      visible={visible}
      title="Choose what you track"
      onClose={onClose}
      footer={<Button label="Done" onPress={onClose} fullWidth />}
    >
      <Text style={styles.hint}>{`Up to ${MAX_CARDS}. The first one is shown large.`}</Text>
      {picked.map((metric, index) => (
        <View key={metric.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{metric.label}</Text>
            <Text style={styles.rowHint} numberOfLines={1}>{metric.hint}</Text>
          </View>
          <TouchableOpacity
            style={styles.small}
            disabled={index === 0}
            onPress={() => onChange(moveCard(chosen, metric.id, -1))}
            accessibilityRole="button"
            accessibilityLabel={`Move ${metric.label} up`}
          >
            <Icon name="arrow-up" size={18} color={index === 0 ? colors.textTertiary : colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.small}
            onPress={() => onChange(toggleCard(chosen, metric.id))}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${metric.label}`}
          >
            <Icon name="minus" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ))}
      {others.length > 0 ? <Text style={styles.section}>Add a figure</Text> : null}
      {others.map((metric) => (
        <TouchableOpacity
          key={metric.id}
          style={[styles.row, isFull && styles.rowDisabled]}
          disabled={isFull}
          onPress={() => onChange(toggleCard(chosen, metric.id))}
          accessibilityRole="button"
          accessibilityLabel={`Add ${metric.label}`}
        >
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{metric.label}</Text>
            <Text style={styles.rowHint} numberOfLines={1}>{metric.hint}</Text>
          </View>
          <Icon name="plus" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onReset} style={styles.reset} accessibilityRole="button">
        <Text style={styles.resetText}>Back to the usual figures</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.body, color: colors.textMuted },
  figure: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  figureLabel: { ...typography.caption, color: colors.textMuted },
  figureValue: { fontSize: 28, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  definition: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  note: { ...typography.caption, color: colors.textMuted },
  section: { ...typography.eyebrow, color: colors.textSecondary, marginTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  rowDisabled: { opacity: 0.45 },
  rowText: { flex: 1, paddingVertical: spacing.sm },
  rowLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  rowHint: { ...typography.caption, color: colors.textMuted },
  small: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  reset: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  resetText: { ...typography.caption, fontWeight: "700", color: colors.accent },
});
