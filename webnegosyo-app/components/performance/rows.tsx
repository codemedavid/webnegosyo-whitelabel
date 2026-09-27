import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";

import { colors, typography, spacing, radius } from "../../theme/colors";
import { formatCount, formatPeso } from "../../lib/format";
import type { ProductSummary, StoreAddonStat } from "../../lib/product-performance/aggregate";
import { Icon } from "../Icon";
import { DeltaPill, ShareBar, formatShare } from "./parts";

/** A product's initial on a warm tile when it has no photo. */
function Thumb({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={styles.thumb} alt="" accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.thumb, styles.thumbFallback]}>
      <Text style={styles.thumbInitial}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
    </View>
  );
}

interface ProductRankRowProps {
  rank: number;
  product: ProductSummary;
  /** Largest sales on the list, so bars compare products to each other. */
  leaderSales: number;
  showChange: boolean;
  onPress: () => void;
}

/** One product in the ranking: what it took, its share, and where it is heading. */
export function ProductRankRow({ rank, product, leaderSales, showChange, onPress }: ProductRankRowProps) {
  const hint = product.topVariation
    ? `Mostly ${product.topVariation.name} · ${formatShare(product.topVariation.share)}`
    : `${formatCount(product.orders)} ${product.orders === 1 ? "order" : "orders"}`;

  return (
    <TouchableOpacity
      style={styles.productRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${product.name}, ${formatPeso(product.sales, 0)}, ${formatCount(product.units)} sold. Open details`}
    >
      <Text style={styles.rank}>{rank}</Text>
      <Thumb name={product.name} imageUrl={product.imageUrl} />
      <View style={styles.productCopy}>
        <View style={styles.productTop}>
          <Text style={styles.productName} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.productSales}>{formatPeso(product.sales, 0)}</Text>
        </View>
        <ShareBar fraction={leaderSales > 0 ? product.sales / leaderSales : 0} color={colors.primary} />
        <View style={styles.productBottom}>
          <Text style={styles.productMeta} numberOfLines={1}>
            {formatCount(product.units)} sold · {hint}
          </Text>
          {showChange && <DeltaPill change={product.salesChange} />}
        </View>
      </View>
      <Icon name="chevron" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

/** One add-on across the whole store. */
export function StoreAddonRow({ rank, addon }: { rank: number; addon: StoreAddonStat }) {
  const onItems =
    addon.productNames.length === 1
      ? `on ${addon.productNames[0]}`
      : `on ${addon.productNames[0]} + ${addon.productNames.length - 1} more`;

  return (
    <View
      style={styles.addonRow}
      accessibilityLabel={`${addon.name}, ${formatCount(addon.units)} sold, in ${formatShare(addon.orderShare)} of orders`}
    >
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.productCopy}>
        <View style={styles.productTop}>
          <Text style={styles.productName} numberOfLines={1}>
            {addon.name}
          </Text>
          <Text style={[styles.productSales, addon.revenue === null && styles.muted]}>
            {addon.revenue === null ? "No price" : `${addon.revenueIsEstimate ? "≈ " : ""}${formatPeso(addon.revenue, 0)}`}
          </Text>
        </View>
        <ShareBar fraction={addon.orderShare} color={colors.accent} />
        <Text style={styles.productMeta} numberOfLines={1}>
          {formatCount(addon.units)} sold · {formatShare(addon.orderShare)} of orders · {onItems}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 72,
  },
  addonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rank: {
    width: 20,
    ...typography.caption,
    fontWeight: "800",
    color: colors.textTertiary,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  thumb: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceSubtle },
  thumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  thumbInitial: { fontSize: 18, fontWeight: "800", color: colors.textSecondary },
  productCopy: { flex: 1, minWidth: 0, gap: 6 },
  productTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  productName: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  productSales: { ...typography.body, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  productBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  productMeta: { ...typography.caption, color: colors.textSecondary, flexShrink: 1, fontVariant: ["tabular-nums"] },
  muted: { color: colors.textSecondary },
});
