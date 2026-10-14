import React, { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatPeso } from "../../lib/activity/format";
import type { SummaryModel } from "../../lib/activity/summary-model";
import { OWL_IMAGE } from "./owl-image";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";


const DEFINITION =
  "Refunds + cancels after payment + discounts you gave by hand + stock wasted at cost. " +
  "Senior and PWD discounts, vouchers and rewards are never counted here. " +
  "The % compares refunds, discounts and waste with sales (cancels aren't split by payment for older days).";

function percentText(value: number): string {
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

function ComparisonLine({ leak }: { leak: SummaryModel["leak"] }) {
  if (leak.comparison === "no_sales") return <Text style={styles.sub}>No sales recorded yet.</Text>;
  const current = percentText(leak.percentOfSales ?? 0);
  if (leak.comparison === "not_enough_history") {
    return <Text style={styles.sub}>{current} of sales · Not enough history to compare yet</Text>;
  }
  const usual = percentText(leak.usualPercent ?? 0);
  if (leak.comparison === "normal") {
    return (
      <View style={styles.subRow}>
        <Icon name="check" size={14} color={colors.success} strokeWidth={2.25} />
        <Text style={[styles.sub, styles.normal]}>
          {current} of sales · usually {usual} · normal
        </Text>
      </View>
    );
  }
  return (
    <Text style={styles.sub}>
      {current} of sales · usually {usual}
    </Text>
  );
}

interface SummaryHeroProps {
  model: SummaryModel;
}

/**
 * The one number the Summary leads with (spec §3.4.2). A clean day gets the
 * static Owl and "Clean day!" — the only place the Owl appears on this tab.
 */
export function SummaryHero({ model }: SummaryHeroProps) {
  const [isDefinitionOpen, setDefinitionOpen] = useState(false);

  if (model.isAllClear) {
    return (
      <View style={[styles.card, styles.clean]}>
        <Image source={OWL_IMAGE} alt="" style={styles.owl} accessible={false} accessibilityIgnoresInvertColors />
        <Text style={styles.cleanTitle}>{"₱0 didn't stay. Clean day!"}</Text>
        {model.drawers.line ? <Text style={styles.sub}>All drawers matched.</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.card} accessible={false}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{"Money that didn't stay"}</Text>
        <TouchableOpacity
          onPress={() => setDefinitionOpen((open) => !open)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={isDefinitionOpen ? "Hide what counts" : "What counts"}
        >
          <Icon name="info" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.amount} accessibilityLabel={`${formatPeso(model.leak.amount)} didn't stay`}>
        {formatPeso(model.leak.amount)}
      </Text>
      <ComparisonLine leak={model.leak} />
      {isDefinitionOpen ? <Text style={styles.definition}>{DEFINITION}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, ...shadow.sm },
  clean: { alignItems: "center", paddingVertical: spacing.xl },
  owl: { width: 64, height: 64, marginBottom: spacing.sm },
  cleanTitle: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...typography.caption, fontWeight: "700", color: colors.textMuted },
  amount: { fontSize: 32, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  subRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sub: { ...typography.caption, color: colors.textMuted },
  normal: { color: colors.success, fontWeight: "600" },
  definition: { ...typography.caption, color: colors.textPrimary, marginTop: spacing.sm },
});
