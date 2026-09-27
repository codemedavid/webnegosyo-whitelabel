import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatCount, formatPeso } from "../../lib/format";
import type { Insight } from "../../lib/product-performance/insights";
import { Sparkline } from "../Sparkline";
import { Icon, type IconName } from "../Icon";

/**
 * Small pieces the product performance screens share. Presentation only —
 * every figure arrives already computed by `lib/product-performance`.
 */

/** The categorical palette for a variation mix, in the app's editorial tones. */
export const MIX_COLORS = [
  colors.accent,
  colors.primary,
  colors.warning,
  colors.success,
  colors.info,
  "#B23E1B",
] as const;

export function mixColor(index: number): string {
  return MIX_COLORS[index % MIX_COLORS.length];
}

export function formatShare(fraction: number): string {
  if (fraction > 0 && fraction < 0.01) return "<1%";
  return `${Math.round(fraction * 100)}%`;
}

// --- delta -----------------------------------------------------------------------

interface DeltaPillProps {
  change: number | null;
  /** On the dark hero the pill needs its own light ground. */
  onDark?: boolean;
}

/** "▲ 12%" in green or "▼ 8%" in red; a quiet dash when there is no baseline. */
export function DeltaPill({ change, onDark = false }: DeltaPillProps) {
  if (change === null) {
    return (
      <View style={[styles.deltaPill, onDark ? styles.deltaPillDarkNeutral : styles.deltaPillNeutral]}>
        <Text style={[styles.deltaText, { color: onDark ? colors.heroInkMuted : colors.textSecondary }]}>—</Text>
      </View>
    );
  }
  const rounded = Math.round(change * 100);
  const tone =
    rounded > 0
      ? { bg: colors.successLight, fg: colors.success, arrow: "▲" }
      : rounded < 0
        ? { bg: colors.dangerLight, fg: colors.danger, arrow: "▼" }
        : { bg: colors.surfaceSubtle, fg: colors.textSecondary, arrow: "" };
  const label = rounded === 0 ? "0%" : `${tone.arrow} ${Math.abs(rounded)}%`;
  return (
    <View style={[styles.deltaPill, { backgroundColor: tone.bg }]} accessibilityLabel={describeChange(change)}>
      <Text style={[styles.deltaText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

function describeChange(change: number): string {
  const rounded = Math.round(change * 100);
  if (rounded === 0) return "No change";
  return rounded > 0 ? `Up ${rounded} percent` : `Down ${Math.abs(rounded)} percent`;
}

// --- hero --------------------------------------------------------------------------

interface HeroStat {
  label: string;
  value: string;
}

interface PerformanceHeroProps {
  eyebrow: string;
  sales: number;
  change: number | null;
  comparisonLabel: string;
  stats: readonly HeroStat[];
  daily: readonly number[];
  /** Shown instead of the comparison when part of the period could not be read. */
  partialNote?: string | null;
}

/**
 * The period's money on a dark card, the way a banking app shows a balance:
 * one big number, its movement, and the shape of the days behind it.
 */
export function PerformanceHero({
  eyebrow,
  sales,
  change,
  comparisonLabel,
  stats,
  daily,
  partialNote,
}: PerformanceHeroProps) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
        {formatPeso(sales, 0)}
      </Text>

      <View style={styles.heroDeltaRow}>
        {partialNote ? (
          <Text style={styles.heroMuted}>{partialNote}</Text>
        ) : (
          <>
            <DeltaPill change={change} onDark />
            <Text style={styles.heroMuted}>
              {change === null ? `Nothing to compare with ${comparisonLabel}` : `vs ${comparisonLabel}`}
            </Text>
          </>
        )}
      </View>

      {daily.length > 1 && (
        <Sparkline values={daily} color={colors.tabBarActive} height={40} highlightLast style={styles.heroSpark} />
      )}

      <View style={styles.heroDivider} />

      <View style={styles.heroStats}>
        {stats.map((stat, index) => (
          <React.Fragment key={stat.label}>
            {index > 0 && <View style={styles.heroStatSeparator} />}
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                {stat.value}
              </Text>
              <Text style={styles.heroStatLabel}>{stat.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// --- insights ----------------------------------------------------------------------

const INSIGHT_ICON: Record<Insight["tone"], { icon: IconName; fg: string; bg: string }> = {
  up: { icon: "growth", fg: colors.success, bg: colors.successLight },
  down: { icon: "minus", fg: colors.danger, bg: colors.dangerLight },
  neutral: { icon: "info", fg: colors.info, bg: colors.infoLight },
  tip: { icon: "plus", fg: colors.accent, bg: colors.accentLight },
};

/** Two or three plain sentences, each with a small coloured mark. */
export function InsightList({ insights }: { insights: readonly Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <View style={styles.insightCard}>
      {insights.map((insight, index) => {
        const tone = INSIGHT_ICON[insight.tone];
        return (
          <View key={insight.text} style={[styles.insightRow, index > 0 && styles.insightRowDivided]}>
            <View style={[styles.insightMark, { backgroundColor: tone.bg }]}>
              <Icon name={tone.icon} size={14} color={tone.fg} />
            </View>
            <Text style={styles.insightText}>{insight.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

// --- bars ----------------------------------------------------------------------------

/** A thin horizontal share bar; always visible when the value is non-zero. */
export function ShareBar({ fraction, color = colors.primary }: { fraction: number; color?: string }) {
  const width = fraction <= 0 ? 0 : Math.max(fraction * 100, 3);
  return (
    <View style={styles.shareTrack} accessibilityElementsHidden>
      <View style={[styles.shareFill, { width: `${Math.min(width, 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Section eyebrow in the app's editorial style. */
export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

/** "12 sold" / "1 sold". */
export function formatSold(units: number): string {
  return `${formatCount(units)} sold`;
}

const styles = StyleSheet.create({
  deltaPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  deltaPillNeutral: { backgroundColor: colors.surfaceSubtle },
  deltaPillDarkNeutral: { backgroundColor: colors.heroInkElevated },
  deltaText: { ...typography.small, fontWeight: "800", fontVariant: ["tabular-nums"] },

  hero: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.md,
  },
  heroEyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  heroValue: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.heroInkText,
    marginTop: spacing.sm,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  heroDeltaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  heroMuted: { ...typography.small, color: colors.heroInkMuted, flexShrink: 1 },
  heroSpark: { marginTop: spacing.lg },
  heroDivider: { height: 1, backgroundColor: colors.heroInkElevated, marginVertical: spacing.lg },
  heroStats: { flexDirection: "row", alignItems: "center" },
  heroStat: { flex: 1 },
  heroStatSeparator: { width: 1, height: 32, backgroundColor: colors.heroInkElevated, marginHorizontal: spacing.md },
  heroStatValue: { fontSize: 18, fontWeight: "800", color: colors.heroInkText, fontVariant: ["tabular-nums"] },
  heroStatLabel: {
    ...typography.small,
    color: colors.heroInkMuted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  insightCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  insightRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  insightRowDivided: { borderTopWidth: 1, borderTopColor: colors.separator },
  insightMark: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  insightText: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 21 },

  shareTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  shareFill: { height: 6, borderRadius: 3 },

  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.eyebrow, color: colors.textSecondary },
  sectionDetail: { ...typography.small, color: colors.textSecondary },
});
