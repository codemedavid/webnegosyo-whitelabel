import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";

interface ProductTileProps {
  name: string;
  price: number;
  /** Units of this item already in the sale. Zero renders no badge. */
  quantity: number;
  /** True when tapping opens the modifier sheet instead of adding directly. */
  hasOptions: boolean;
  onPress: () => void;
}

/**
 * One product button on the register grid.
 *
 * Sized for a thumb on a phone held one-handed at a counter: the whole tile is
 * the hit target, the name gets two lines before truncating, and the live
 * quantity badge means the cashier can confirm what they rang up without
 * opening the cart.
 */
export function ProductTile({ name, price, quantity, hasOptions, onPress }: ProductTileProps) {
  const isInSale = quantity > 0;

  return (
    <TouchableOpacity
      style={[styles.tile, isInSale && styles.tileInSale]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={
        isInSale
          ? `${name}, ${formatPeso(price)}, ${quantity} in sale`
          : `${name}, ${formatPeso(price)}`
      }
    >
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>

      <View style={styles.footer}>
        <Text style={[styles.price, isInSale && styles.priceInSale]}>{formatPeso(price)}</Text>
        {hasOptions && !isInSale ? <Text style={styles.options}>›</Text> : null}
      </View>

      {isInSale ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{quantity}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 78,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    justifyContent: "space-between",
    ...shadow.sm,
  },
  tileInSale: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentLight },
  name: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 17,
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  price: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  priceInSale: { color: colors.accent },
  options: { ...typography.caption, color: colors.textTertiary, lineHeight: 15 },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: { ...typography.small, fontWeight: "800", color: colors.textOnDark },
});
