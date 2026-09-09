import React, { memo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { getInitials, getAvatarColor } from "../../lib/order-visuals";
import type { BundleGroup, BundleOrderItem } from "../../lib/order-bundle-groups";

/**
 * The lines of an order as the detail screen draws them: a loose item row,
 * and a bundle card that folds its lines under one header. Presentation only —
 * grouping is `lib/order-bundle-groups`, images come from the caller.
 */

export type OrderItemImages = ReadonlyMap<string, string>;

/** A key that survives re-ordering better than the index alone. */
export function orderLineKey(item: BundleOrderItem, index: number): string {
  return `${item.menuItemId ?? item.menuItemName}-${index}`;
}

export function ItemThumb({ url, name }: { url?: string; name: string }) {
  if (url) {
    return <Image source={{ uri: url }} style={thumbStyles.thumb} alt={name} />;
  }
  return (
    <View style={[thumbStyles.thumb, thumbStyles.placeholder, { backgroundColor: getAvatarColor(name) }]}>
      <Text style={thumbStyles.placeholderText}>{getInitials(name)}</Text>
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceSubtle, marginRight: spacing.md },
  placeholder: { alignItems: "center", justifyContent: "center" },
  placeholderText: { color: colors.textOnDark, fontWeight: "800", fontSize: 14 },
});

function ItemModifiers({ item }: { item: BundleOrderItem }) {
  return (
    <>
      {item.variationSelections && item.variationSelections.length > 0 ? (
        item.variationSelections.map((v, vi) => (
          <Text key={`${v.typeName}-${vi}`} style={itemStyles.itemDetail}>{v.typeName}: {v.optionName}</Text>
        ))
      ) : item.variation ? (
        <Text style={itemStyles.itemDetail}>Variation: {item.variation}</Text>
      ) : null}
      {item.addons && item.addons.length > 0 && (
        <Text style={itemStyles.itemDetail}>Add-ons: {item.addons.map((a) => a.name).join(", ")}</Text>
      )}
      {item.specialInstructions && (
        <Text style={itemStyles.itemDetail}>Note: {item.specialInstructions}</Text>
      )}
    </>
  );
}

interface OrderLineItemRowProps {
  item: BundleOrderItem;
  images: OrderItemImages;
  isLast: boolean;
}

export const OrderLineItemRow = memo(function OrderLineItemRow({ item, images, isLast }: OrderLineItemRowProps) {
  return (
    <View style={[itemStyles.itemRow, !isLast && itemStyles.itemBorder]}>
      <ItemThumb url={item.menuItemId ? images.get(item.menuItemId) : undefined} name={item.menuItemName} />
      <View style={itemStyles.itemBody}>
        <Text style={itemStyles.itemName}>{item.menuItemName}</Text>
        <ItemModifiers item={item} />
      </View>
      <View style={itemStyles.itemRight}>
        <Text style={itemStyles.itemQty}>x{item.quantity}</Text>
        <Text style={itemStyles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
      </View>
    </View>
  );
});

interface BundleCardProps {
  bundle: BundleGroup;
  images: OrderItemImages;
}

export const BundleCard = memo(function BundleCard({ bundle, images }: BundleCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={bundleStyles.container}>
      <TouchableOpacity
        style={bundleStyles.header}
        onPress={() => setExpanded((open) => !open)}
        activeOpacity={0.7}
      >
        <View style={bundleStyles.headerLeft}>
          <View style={bundleStyles.bundleTag}>
            <Text style={bundleStyles.bundleTagText}>Bundle</Text>
          </View>
          <View>
            <Text style={bundleStyles.bundleName}>{bundle.bundleName}</Text>
            <Text style={bundleStyles.itemCount}>
              {bundle.items.length} item{bundle.items.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <View style={bundleStyles.headerRight}>
          <Text style={bundleStyles.bundleTotal}>₱{bundle.total.toFixed(2)}</Text>
          <Text style={bundleStyles.chevron}>{expanded ? "Hide" : "Show"}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={bundleStyles.itemList}>
          {bundle.items.map((item, i) => (
            <View
              key={orderLineKey(item, i)}
              style={[bundleStyles.item, i < bundle.items.length - 1 && bundleStyles.itemBorder]}
            >
              <ItemThumb url={item.menuItemId ? images.get(item.menuItemId) : undefined} name={item.menuItemName} />
              <View style={itemStyles.itemBody}>
                {item.slotName && <Text style={bundleStyles.slotLabel}>{item.slotName}</Text>}
                <Text style={itemStyles.itemName}>{item.menuItemName}</Text>
                <ItemModifiers item={item} />
              </View>
              <View style={itemStyles.itemRight}>
                <Text style={itemStyles.itemQty}>x{item.quantity}</Text>
                <Text style={itemStyles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

const itemStyles = StyleSheet.create({
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  itemBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.separator },
  itemBody: { flex: 1 },
  itemName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  itemDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemRight: { alignItems: "flex-end", marginLeft: spacing.md },
  itemQty: { ...typography.caption, color: colors.textSecondary },
  itemPrice: { ...typography.body, color: colors.primary, fontWeight: "600" },
});

const bundleStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    marginVertical: spacing.xs,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  bundleName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  itemCount: {
    ...typography.small,
    color: colors.textTertiary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bundleTotal: {
    ...typography.body,
    fontWeight: "600",
    color: colors.primary,
  },
  chevron: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  itemList: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.separator,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
  },
  itemBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  slotLabel: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
  },
});
