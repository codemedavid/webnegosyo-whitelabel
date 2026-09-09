import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Card } from "../Card";
import { Icon } from "../Icon";
import { getInitials, getAvatarColor } from "../../lib/order-visuals";
import { orderSummaryRows } from "../../lib/order-summary-rows";
import type { SummarisableDiscount } from "../../lib/order-summary-rows";

export interface OrderLineItem {
  menuItemId?: string;
  menuItemName: string;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string; priceAdjustment: number }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  quantity: number;
  subtotal: number;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

interface BundleGroup {
  bundleId: string;
  bundleName: string;
  items: OrderLineItem[];
  total: number;
}

export function groupBundleItems(items: OrderLineItem[]): {
  regularItems: OrderLineItem[];
  bundles: BundleGroup[];
} {
  const regularItems: OrderLineItem[] = [];
  const bundleMap = new Map<string, BundleGroup>();

  for (const item of items) {
    if (item.isBundleItem && item.bundleId) {
      const existing = bundleMap.get(item.bundleId);
      if (existing) {
        bundleMap.set(item.bundleId, {
          ...existing,
          items: [...existing.items, item],
          total: existing.total + item.subtotal,
        });
      } else {
        bundleMap.set(item.bundleId, {
          bundleId: item.bundleId,
          bundleName: item.bundleName ?? "Bundle",
          items: [item],
          total: item.subtotal,
        });
      }
    } else {
      regularItems.push(item);
    }
  }

  return { regularItems, bundles: Array.from(bundleMap.values()) };
}

function ItemThumb({ url, name }: { url?: string; name: string }) {
  if (url) {
    return <Image source={{ uri: url }} style={styles.thumb} alt={name} />;
  }
  return (
    <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: getAvatarColor(name) }]}>
      <Text style={styles.thumbPlaceholderText}>{getInitials(name)}</Text>
    </View>
  );
}

function ItemLine({
  item,
  image,
  isLast,
  slotLabel,
}: {
  item: OrderLineItem;
  image?: string;
  isLast: boolean;
  slotLabel?: string;
}) {
  return (
    <View style={[styles.itemRow, !isLast && styles.itemBorder]}>
      <ItemThumb url={image} name={item.menuItemName} />
      <View style={styles.itemBody}>
        {slotLabel ? <Text style={styles.slotLabel}>{slotLabel}</Text> : null}
        <Text style={styles.itemName}>{item.menuItemName}</Text>
        {item.variationSelections && item.variationSelections.length > 0 ? (
          item.variationSelections.map((v, vi) => (
            <Text key={vi} style={styles.itemDetail}>
              {v.typeName}: {v.optionName}
            </Text>
          ))
        ) : item.variation ? (
          <Text style={styles.itemDetail}>Variation: {item.variation}</Text>
        ) : null}
        {item.addons && item.addons.length > 0 && (
          <Text style={styles.itemDetail}>Add-ons: {item.addons.map((a) => a.name).join(", ")}</Text>
        )}
        {item.specialInstructions && (
          <Text style={styles.itemNote}>Note: {item.specialInstructions}</Text>
        )}
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemQty}>x{item.quantity}</Text>
        <Text style={styles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function BundleCard({ bundle, images }: { bundle: BundleGroup; images: Map<string, string> }) {
  const [isExpanded, setExpanded] = useState(true);
  const count = bundle.items.length;

  return (
    <View style={styles.bundle}>
      <TouchableOpacity
        style={styles.bundleHeader}
        onPress={() => setExpanded((open) => !open)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${bundle.bundleName} bundle, ${count} item${count === 1 ? "" : "s"}`}
      >
        <View style={styles.bundleTag}>
          <Text style={styles.bundleTagText}>Bundle</Text>
        </View>
        <View style={styles.bundleCopy}>
          <Text style={styles.bundleName} numberOfLines={1}>
            {bundle.bundleName}
          </Text>
          <Text style={styles.bundleCount}>
            {count} item{count === 1 ? "" : "s"}
          </Text>
        </View>
        <Text style={styles.bundleTotal}>₱{bundle.total.toFixed(2)}</Text>
        <Icon name={isExpanded ? "chevron-down" : "chevron"} size={16} color={colors.textTertiary} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.bundleItems}>
          {bundle.items.map((item, i) => (
            <ItemLine
              key={i}
              item={item}
              image={item.menuItemId ? images.get(item.menuItemId) : undefined}
              isLast={i === count - 1}
              slotLabel={item.slotName}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface OrderItemsCardProps {
  items: OrderLineItem[];
  images: Map<string, string>;
  deliveryFee?: number;
  serviceCharge?: number;
  discount: SummarisableDiscount | null;
  total: number;
}

/**
 * What was ordered and what it added up to.
 *
 * Bundles fold into one collapsible row each; the totals underneath come from
 * `orderSummaryRows`, the same rules the printed receipt uses, so a
 * discounted order never lists dishes that fail to add up to what was charged.
 */
export function OrderItemsCard({
  items,
  images,
  deliveryFee,
  serviceCharge,
  discount,
  total,
}: OrderItemsCardProps) {
  const { regularItems, bundles } = groupBundleItems(items);
  const rows = orderSummaryRows({
    subtotal: items.reduce((sum, item) => sum + item.subtotal, 0),
    deliveryFee,
    serviceCharge,
    discount,
    total,
  });

  return (
    <Card title={`Items (${items.length})`} style={styles.card}>
      {regularItems.map((item, i) => (
        <ItemLine
          key={i}
          item={item}
          image={item.menuItemId ? images.get(item.menuItemId) : undefined}
          isLast={i === regularItems.length - 1 && bundles.length === 0}
        />
      ))}
      {bundles.map((bundle) => (
        <BundleCard key={bundle.bundleId} bundle={bundle} images={images} />
      ))}

      {rows.map((row, index) => {
        const isTotal = row.kind === "total";
        return (
          <View key={`${row.kind}-${index}`} style={isTotal ? styles.totalRow : styles.summaryRow}>
            <Text style={isTotal ? styles.totalLabel : styles.summaryLabel}>
              {row.label}
              {/* The voucher's NAME can be shared by two vouchers; the code
                  is what a merchant reconciles against. */}
              {row.code ? <Text style={styles.summaryCode}>  {row.code}</Text> : null}
            </Text>
            <Text
              style={[
                isTotal ? styles.totalValue : styles.summaryValue,
                row.kind === "discount" && styles.summaryDiscount,
              ]}
            >
              {row.kind === "discount" ? "−" : ""}₱{row.amount.toFixed(2)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    marginRight: spacing.md,
  },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  thumbPlaceholderText: { color: colors.textOnDark, fontWeight: "800", fontSize: 14 },

  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  itemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  itemBody: { flex: 1 },
  itemName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  itemDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemNote: { ...typography.caption, color: colors.accent, fontWeight: "600", marginTop: 2 },
  itemRight: { alignItems: "flex-end", marginLeft: spacing.md },
  itemQty: { ...typography.caption, color: colors.textSecondary },
  itemPrice: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  slotLabel: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "700",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  bundle: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
    overflow: "hidden",
  },
  bundleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: 52,
  },
  bundleTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  bundleTagText: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bundleCopy: { flex: 1 },
  bundleName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  bundleCount: { ...typography.small, color: colors.textSecondary },
  bundleTotal: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  bundleItems: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },

  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.xs },
  summaryLabel: { ...typography.body, color: colors.textSecondary, flex: 1, marginRight: spacing.sm },
  summaryValue: { ...typography.body, color: colors.textPrimary },
  summaryDiscount: { color: colors.success },
  summaryCode: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  totalLabel: { ...typography.heading, color: colors.textPrimary },
  totalValue: { ...typography.heading, color: colors.textPrimary },
});
