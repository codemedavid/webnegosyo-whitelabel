import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatCount } from "../../lib/format";
import type { ItemPartners, PairRow, PairSuggestion } from "../../lib/pairings";
import { ShareBar, formatShare, mixColor } from "./parts";

/**
 * The rows of the Pairs view. Presentation only — every figure arrives already
 * computed by `lib/pairings`.
 */

const SUGGESTION_BADGE: Record<PairSuggestion, { label: string; fg: string; bg: string }> = {
  combo: { label: "Combo idea", fg: colors.accent, bg: colors.accentLight },
  pairing: { label: "Pairing idea", fg: colors.success, bg: colors.successLight },
};

function ordersTogether(count: number): string {
  return `${formatCount(count)} ${count === 1 ? "order" : "orders"} together`;
}

// --- summary ---------------------------------------------------------------------

interface PairingSummaryProps {
  eyebrow: string;
  multiItemShare: number;
  orderCount: number;
  multiItemOrders: number;
  avgItemsPerOrder: number;
  partialNote: string | null;
}

/** How often customers buy more than one thing, on the dark hero card. */
export function PairingSummary({
  eyebrow,
  multiItemShare,
  orderCount,
  multiItemOrders,
  avgItemsPerOrder,
  partialNote,
}: PairingSummaryProps) {
  const stats = [
    { label: "Orders", value: formatCount(orderCount) },
    { label: "With 2+ items", value: formatCount(multiItemOrders) },
    { label: "Items / order", value: avgItemsPerOrder.toFixed(1) },
  ];
  return (
    <View style={styles.hero}>
      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text style={styles.heroValue} accessibilityRole="header">
        {formatShare(multiItemShare)}
      </Text>
      <Text style={styles.heroMuted}>
        {partialNote ?? "of orders had two or more different items"}
      </Text>
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

// --- pair rows -------------------------------------------------------------------

interface PairRowViewProps {
  pair: PairRow;
  /** Categories read "also had", items read "is in". */
  kind: "item" | "category";
}

/** "Burger + Fries — Fries is in 75% of Burger orders". */
export function PairRowView({ pair, kind }: PairRowViewProps) {
  const badge = kind === "item" && pair.suggestion ? SUGGESTION_BADGE[pair.suggestion] : null;
  const headline =
    kind === "item"
      ? `${pair.partner.name} is in ${formatShare(pair.share)} of ${pair.anchor.name} orders`
      : `${formatShare(pair.share)} of ${pair.anchor.name} orders also had ${pair.partner.name}`;
  const reverse =
    kind === "category"
      ? ` · ${formatShare(pair.reverseShare)} the other way`
      : "";

  return (
    <View style={styles.row} accessible accessibilityLabel={`${pair.anchor.name} and ${pair.partner.name}. ${headline}. ${ordersTogether(pair.together)}.`}>
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {pair.anchor.name} <Text style={styles.plus}>+</Text> {pair.partner.name}
        </Text>
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        )}
      </View>
      <Text style={styles.rowLine}>{headline}</Text>
      <View style={styles.barRow}>
        <View style={styles.bar}>
          <ShareBar fraction={pair.share} color={kind === "item" ? colors.accent : colors.primary} />
        </View>
      </View>
      <Text style={styles.rowMeta}>
        {ordersTogether(pair.together)}
        {reverse}
      </Text>
    </View>
  );
}

// --- per-item partners -------------------------------------------------------------

/** One popular item and what most often comes with it. */
export function ItemPartnersCard({ entry }: { entry: ItemPartners }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {entry.item.name}
      </Text>
      <Text style={styles.rowMeta}>
        {entry.categoryName} · in {formatCount(entry.orders)} {entry.orders === 1 ? "order" : "orders"}
      </Text>
      <View style={styles.partners}>
        {entry.partners.map((partner, index) => (
          <View
            key={partner.id}
            style={styles.partner}
            accessible
            accessibilityLabel={`${partner.name}, in ${formatShare(partner.share)} of ${entry.item.name} orders`}
          >
            <View style={styles.partnerTop}>
              <Text style={styles.partnerName} numberOfLines={1}>
                {partner.name}
              </Text>
              <Text style={styles.partnerShare}>{formatShare(partner.share)}</Text>
            </View>
            <ShareBar fraction={partner.share} color={mixColor(index)} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  heroMuted: { ...typography.small, color: colors.heroInkMuted, marginTop: spacing.xs },
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

  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "700", flex: 1 },
  plus: { color: colors.textSecondary, fontWeight: "400" },
  rowLine: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  rowMeta: { ...typography.small, color: colors.textSecondary, marginTop: spacing.xs },
  barRow: { marginTop: spacing.sm },
  bar: { flex: 1 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { ...typography.small, fontWeight: "800" },

  partners: { marginTop: spacing.sm, gap: spacing.sm },
  partner: { gap: 4 },
  partnerTop: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  partnerName: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  partnerShare: { ...typography.caption, color: colors.textPrimary, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
