import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { colors, typography, radius, shadow, spacing } from "../theme/colors";
import { formatPeso, formatPesoCompact, formatCount } from "../lib/format";
import { formatPercent } from "../lib/analytics-utils";
import type { BranchKpisWithVerdict } from "../lib/branch-verdict";
import { Sparkline } from "./Sparkline";
import { VerdictPill } from "./VerdictPill";

/**
 * One branch, at a glance.
 *
 * The card is built as a top-down funnel of attention, because an owner reads
 * it in about three seconds:
 *
 *   1. **Name and takings** — where am I, and how much.
 *   2. **Direction** — the arrow against the previous window, and the silhouette.
 *      Direction beats level: ₱200k climbing and ₱200k sliding are different
 *      businesses.
 *   3. **The four levers** — ticket size, loyalty, throughput, leak. Two rows of
 *      two, so each stays legible on a phone rather than four columns squeezed
 *      into a strip.
 *   4. **One instruction** — the verdict, plus the sentence that says what to do.
 *
 * Every figure comes pre-computed from `branch-kpis.ts`; this file does no
 * arithmetic beyond formatting, so the cards can never disagree with the store
 * total above them.
 */

interface BranchPerformanceCardProps {
  row: BranchKpisWithVerdict;
  /** Tapping drills into the branch. Omitted for rows there is nothing to open. */
  onPress?: () => void;
  /** Hide the action sentence to keep long lists compact. */
  hideAction?: boolean;
}

/** Below this, a repeat rate describes the data rather than the guests. */
const MIN_TRUSTWORTHY_IDENTIFIED_SHARE = 0.25;

function DeltaBadge({ delta }: { delta: number | null }) {
  // No baseline is not "flat" — a branch's first period has nothing to beat, and
  // an arrow there would be an invented claim.
  if (delta === null) {
    return <Text style={styles.deltaMuted}>new</Text>;
  }

  const isUp = delta >= 0;
  return (
    <Text style={[styles.delta, { color: isUp ? colors.success : colors.danger }]}>
      {isUp ? "▲" : "▼"} {formatPercent(Math.abs(delta) * 100)}
    </Text>
  );
}

function Metric({ label, value, hint, tone }: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === "danger" && styles.metricValueDanger]}>
        {value}
      </Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

export function BranchPerformanceCard({ row, onPress, hideAction }: BranchPerformanceCardProps) {
  const isUnassigned = row.outletId === null;
  const tone = row.verdict.tone;

  // The accent stripe is the triage device: running a finger down the list, red
  // edges are the branches losing money today.
  const stripeColor =
    tone === "bad"
      ? colors.danger
      : tone === "warn"
        ? colors.warning
        : tone === "good"
          ? colors.success
          : colors.separator;

  const knowsItsGuests = row.identifiedShare >= MIN_TRUSTWORTHY_IDENTIFIED_SHARE;

  const body = (
    <View style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text
            style={[styles.name, isUnassigned && styles.nameMuted]}
            numberOfLines={1}
          >
            {row.outletName}
          </Text>
          <Text style={styles.share}>
            {formatPercent(row.revenueShare * 100)} of store
            {row.tradingHours > 0 ? ` · ${formatCount(row.tradingHours)}h trading` : ""}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.revenue}>{formatPesoCompact(row.revenue)}</Text>
          <DeltaBadge delta={row.revenueDelta} />
        </View>
      </View>

      <Sparkline
        values={row.dailyRevenue}
        color={tone === "bad" ? colors.danger : colors.primary}
        highlightLast
        style={styles.sparkline}
      />

      <View style={styles.metrics}>
        <Metric
          label="Avg ticket"
          value={formatPeso(row.averageOrderValue, 0)}
          hint={`${formatCount(row.orderCount)} orders`}
        />
        <Metric
          label="Repeat guests"
          value={knowsItsGuests ? formatPercent(row.repeatRate * 100) : "—"}
          // Naming the reason beats a bare dash: the owner can fix it by
          // collecting contacts, and an unexplained gap reads as a broken screen.
          hint={
            knowsItsGuests
              ? `${formatPercent(row.identifiedShare * 100)} identified`
              : "too few contacts"
          }
        />
      </View>

      <View style={styles.metrics}>
        <Metric
          label="Per trading hour"
          value={formatPesoCompact(row.revenuePerTradingHour)}
          hint="the like-for-like rank"
        />
        <Metric
          label="Cancellation leak"
          value={formatPercent(row.cancellationRate * 100)}
          hint={
            row.cancelledCount > 0
              ? `${formatPesoCompact(row.lostRevenue)} lost`
              : "nothing lost"
          }
          tone={row.cancelledCount > 0 ? "danger" : undefined}
        />
      </View>

      <View style={styles.verdict}>
        <VerdictPill label={row.verdict.label} tone={tone} />
        {hideAction ? null : (
          <Text style={styles.action} numberOfLines={3}>
            {row.verdict.action}
          </Text>
        )}
      </View>
    </View>
  );

  if (!onPress) return body;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.outletName}. ${formatPeso(row.revenue, 0)} from ${formatCount(row.orderCount)} orders. ${row.verdict.label}`}
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 4,
    overflow: "hidden",
    ...shadow.sm,
  },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerLeft: { flex: 1, paddingRight: spacing.sm },
  headerRight: { alignItems: "flex-end" },
  name: { ...typography.heading, color: colors.textPrimary },
  nameMuted: { color: colors.textSecondary },
  share: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
  revenue: { ...typography.title, color: colors.textPrimary },
  delta: { ...typography.small, fontWeight: "700", marginTop: 2 },
  deltaMuted: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
  sparkline: { marginTop: spacing.md, marginBottom: spacing.md },
  metrics: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  metric: { flex: 1 },
  metricLabel: { ...typography.small, color: colors.textSecondary, marginBottom: 2 },
  metricValue: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  metricValueDanger: { color: colors.danger },
  metricHint: { ...typography.small, color: colors.textTertiary, marginTop: 1 },
  verdict: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  action: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
});
