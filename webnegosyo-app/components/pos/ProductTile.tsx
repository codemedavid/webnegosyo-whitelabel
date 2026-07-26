import React, { useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { thumbUrl } from "../../lib/image-thumb";
import { getAvatarColor, getInitials } from "../../lib/order-visuals";

/**
 * Requested thumbnail width in device pixels. A tile is roughly 110pt wide on a
 * phone; 320px covers a 3x panel without asking the CDN for anything larger.
 */
const THUMB_PX = 320;

interface ProductTileProps {
  name: string;
  price: number;
  /** Raw stored image url. Resized here — callers pass it through untouched. */
  imageUrl?: string | null;
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
 *
 * The image is a CDN-resized thumbnail (see lib/image-thumb.ts) so scrolling a
 * long menu stays cheap. Items without a photo get deterministic initials
 * rather than a grey hole, which also keeps every tile the same height.
 */
export function ProductTile({
  name,
  price,
  imageUrl,
  quantity,
  hasOptions,
  onPress,
}: ProductTileProps) {
  const isInSale = quantity > 0;
  const thumb = useMemo(() => thumbUrl(imageUrl, THUMB_PX), [imageUrl]);

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
      <View style={styles.media}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={styles.image}
            resizeMode="cover"
            alt=""
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={[styles.initials, { color: getAvatarColor(name) }]}>
              {getInitials(name)}
            </Text>
          </View>
        )}

        {isInSale ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{quantity}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.footer}>
          <Text style={[styles.price, isInSale && styles.priceInSale]}>{formatPeso(price)}</Text>
          {hasOptions ? <Text style={styles.options}>›</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
    ...shadow.sm,
  },
  tileInSale: { borderColor: colors.accent, borderWidth: 1.5 },
  media: { width: "100%", aspectRatio: 4 / 3, backgroundColor: colors.surfaceSubtle },
  image: { width: "100%", height: "100%" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 20, fontWeight: "800" },
  body: { paddingHorizontal: spacing.sm + 2, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  name: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 17,
    minHeight: 34,
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 2,
  },
  price: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  priceInSale: { color: colors.accent },
  options: { ...typography.caption, color: colors.textTertiary, lineHeight: 15 },
  badge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  badgeText: { ...typography.caption, fontWeight: "800", color: colors.textOnDark },
});
