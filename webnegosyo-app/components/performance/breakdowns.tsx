import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius } from "../../theme/colors";
import { formatCount, formatPeso } from "../../lib/format";
import type { AddonStat, VariationGroupStat } from "../../lib/product-performance/aggregate";
import { formatOneIn } from "../../lib/product-performance/insights";
import { ShareBar, formatShare, formatSold, mixColor } from "./parts";

/**
 * How a product's units split across one variation group: a single stacked
 * bar you read at a glance, then each option with its share, units and sales.
 */
export function VariationMixCard({ group, productUnits }: { group: VariationGroupStat; productUnits: number }) {
  const segments = [
    ...group.options.map((option, index) => ({ key: option.name, units: option.units, color: mixColor(index) })),
    ...(group.unchosenUnits > 0
      ? [{ key: "__unchosen", units: group.unchosenUnits, color: colors.separator }]
      : []),
  ];
  const favourite = group.options.length >= 2 ? group.options[0] : null;

  return (
    <View style={styles.card} accessibilityLabel={`${group.groupName} mix`}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{group.groupName}</Text>
        <Text style={styles.cardCaption}>{formatCount(productUnits)} sold</Text>
      </View>

      <View style={styles.stack} accessibilityElementsHidden>
        {segments.map((segment) => (
          <View
            key={segment.key}
            style={{ flex: Math.max(segment.units, 0.0001), backgroundColor: segment.color }}
          />
        ))}
      </View>

      {group.options.map((option, index) => (
        <View
          key={option.name}
          style={[styles.optionRow, index > 0 && styles.rowDivided]}
          accessibilityLabel={`${option.name}, ${formatShare(option.share)} of units, ${option.units} sold, ${formatPeso(option.sales, 0)}`}
        >
          <View style={[styles.swatch, { backgroundColor: mixColor(index) }]} />
          <View style={styles.optionCopy}>
            <View style={styles.optionNameRow}>
              <Text style={styles.optionName} numberOfLines={1}>
                {option.name}
              </Text>
              {favourite?.name === option.name && (
                <View style={styles.favouriteBadge}>
                  <Text style={styles.favouriteText}>Favourite</Text>
                </View>
              )}
            </View>
            <Text style={styles.optionMeta}>
              {formatSold(option.units)} · {formatPeso(option.sales, 0)}
            </Text>
          </View>
          <Text style={styles.optionShare}>{formatShare(option.share)}</Text>
        </View>
      ))}

      {group.unchosenUnits > 0 && (
        <View style={[styles.optionRow, styles.rowDivided]}>
          <View style={[styles.swatch, { backgroundColor: colors.separator }]} />
          <View style={styles.optionCopy}>
            <Text style={[styles.optionName, styles.muted]}>No {group.groupName.toLowerCase()} chosen</Text>
            <Text style={styles.optionMeta}>{formatSold(group.unchosenUnits)}</Text>
          </View>
          <Text style={[styles.optionShare, styles.muted]}>
            {formatShare(productUnits > 0 ? group.unchosenUnits / productUnits : 0)}
          </Text>
        </View>
      )}
    </View>
  );
}

/** "1 in 4" under half, a percentage from half up — the way people say it. */
function describeAttach(rate: number): string {
  if (rate >= 0.5) return `${formatShare(rate)} of them`;
  if (rate >= 0.1) return formatOneIn(rate);
  return formatShare(rate);
}

function AddonRevenue({ revenue, isEstimate }: { revenue: number | null; isEstimate: boolean }) {
  if (revenue === null) return <Text style={[styles.addonRevenue, styles.muted]}>No price</Text>;
  return (
    <Text style={styles.addonRevenue}>
      {isEstimate ? "≈ " : ""}
      {formatPeso(revenue, 0)}
    </Text>
  );
}

/** Each add-on: how often it rides along, how many sold, what it brought in. */
export function AddonList({ addons }: { addons: readonly AddonStat[] }) {
  const hasEstimate = addons.some((addon) => addon.revenueIsEstimate);
  return (
    <View style={styles.card}>
      {addons.map((addon, index) => (
        <View
          key={addon.name}
          style={[styles.addonRow, index > 0 && styles.rowDivided]}
          accessibilityLabel={`${addon.name}, added to ${formatShare(addon.attachRate)} of units, ${addon.units} sold`}
        >
          <View style={styles.addonTop}>
            <Text style={styles.optionName} numberOfLines={1}>
              {addon.name}
            </Text>
            <AddonRevenue revenue={addon.revenue} isEstimate={addon.revenueIsEstimate} />
          </View>
          <ShareBar fraction={addon.attachRate} color={colors.accent} />
          <Text style={styles.optionMeta}>
            {describeAttach(addon.attachRate)} add it · {formatSold(addon.units)}
          </Text>
        </View>
      ))}
      {hasEstimate && <EstimateNote />}
    </View>
  );
}

/** The footnote every "≈" figure points to. */
export function EstimateNote() {
  return (
    <Text style={styles.estimateNote}>
      ≈ Online orders don&apos;t record add-on prices, so these use today&apos;s menu price.
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardCaption: { ...typography.caption, color: colors.textSecondary },
  stack: {
    flexDirection: "row",
    height: 14,
    borderRadius: 7,
    overflow: "hidden",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: 2,
  },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.separator },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  optionCopy: { flex: 1, minWidth: 0 },
  optionNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  optionName: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  optionMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontVariant: ["tabular-nums"] },
  optionShare: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  favouriteBadge: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  favouriteText: { ...typography.small, fontWeight: "800", color: "#92400E" },
  muted: { color: colors.textSecondary },

  addonRow: { paddingVertical: spacing.md, gap: spacing.sm },
  addonTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  addonRevenue: { ...typography.body, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  estimateNote: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
