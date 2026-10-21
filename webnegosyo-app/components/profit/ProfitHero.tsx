import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fallingBars, heroEyebrow, heroSentence, type FallRow, type FallTone } from "../../lib/profit/profit-hero";
import type { ProfitReport } from "../../lib/profit/profit-model";
import type { ProfitWindow } from "../../lib/profit/profit-period";
import { notInProfitLine, profitVerdict } from "../../lib/profit/profit-view";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { BigAmount } from "../expenses/BigAmount";

const FALL_COLORS: Readonly<Record<FallTone, string>> = {
  sales: colors.heroInkText,
  ingredients: colors.expenseGroups.ingredients.onHero,
  expenses: colors.expenseGroups.utilities.onHero,
  kept: colors.heroInkPositive,
  loss: colors.heroInkNegative,
};

const TRACK_HEIGHT = 10;

function FallBar({ row }: { row: FallRow }) {
  return (
    <View style={styles.fallRow} accessible accessibilityLabel={row.spoken}>
      <Text style={styles.fallLabel} numberOfLines={1}>
        {row.label}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.segment,
            { left: `${row.offset * 100}%`, width: `${row.width * 100}%`, backgroundColor: FALL_COLORS[row.tone] },
          ]}
        />
      </View>
      <Text style={[styles.fallValue, row.tone === "loss" && styles.lossText]} numberOfLines={1}>
        {row.valueText}
      </Text>
    </View>
  );
}

interface ProfitHeroProps {
  report: ProfitReport;
  period: Pick<ProfitWindow, "preset" | "label" | "isPartial" | "fromKey" | "toKey" | "phrase">;
}

/**
 * The answer first (design §5): what was kept, as a figure and a sentence, then
 * one bar that falls from sales through ingredients and expenses to what is
 * left. A loss is said in words and drawn in a light red that reads on ink.
 */
export function ProfitHero({ report, period }: ProfitHeroProps) {
  const verdict = profitVerdict(report);
  const notInProfit = notInProfitLine(report);
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View accessible accessibilityLabel={`${heroEyebrow(period, verdict.isLoss)}. ${verdict.spoken}`}>
        <Text style={styles.eyebrow}>{heroEyebrow(period, verdict.isLoss)}</Text>
        <BigAmount
          cents={report.profitCents}
          color={verdict.isLoss ? colors.heroInkNegative : colors.heroInkPositive}
          size={40}
          testID="profit-hero-amount"
        />
      </View>
      <Text style={styles.sentence}>{heroSentence(report, period)}</Text>
      <View style={styles.fall}>
        {fallingBars(report).map((row) => (
          <FallBar key={row.key} row={row} />
        ))}
      </View>
      {notInProfit ? <Text style={styles.footnote}>{notInProfit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadow.md,
  },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted, marginBottom: spacing.xs },
  sentence: { ...typography.caption, color: colors.heroInkText },
  fall: { gap: spacing.sm, marginTop: spacing.md },
  fallRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 22 },
  fallLabel: { ...typography.caption, color: colors.heroInkMuted, width: 84 },
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.heroInkElevated,
    overflow: "hidden",
  },
  segment: { position: "absolute", top: 0, bottom: 0, borderRadius: radius.full },
  fallValue: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.heroInkText,
    width: 72,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  lossText: { color: colors.heroInkNegative },
  footnote: { ...typography.small, color: colors.heroInkMuted, marginTop: spacing.sm },
});
