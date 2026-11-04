import React, { useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { POS_TILE_THUMB_PX, thumbUrl } from "../../lib/image-thumb";
import { getAvatarColor, getInitials } from "../../lib/order-visuals";
import type { StockHint } from "../../lib/pos-stock-hint";

interface ProductTileProps {
  name: string;
  price: number;
  /** Raw stored image url. Resized here — callers pass it through untouched. */
  imageUrl?: string | null;
  /** Units of this item already in the sale. Zero renders no badge. */
  quantity: number;
  /** True when tapping opens the modifier sheet instead of adding directly. */
  hasOptions: boolean;
  /**
   * The merchant's "sold out" switch (dish off, or a required choice with
   * nothing left). Greyed and labelled; the screen decides what a tap says —
   * it never adds the dish.
   */
  isSoldOut?: boolean;
  /** "N left" / "0 left" from the stock ESTIMATE. A hint only — still tappable. */
  stockHint?: StockHint | null;
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
  isSoldOut = false,
  stockHint = null,
  onPress,
}: ProductTileProps) {
  const isInSale = quantity > 0;
  const thumb = useMemo(() => thumbUrl(imageUrl, POS_TILE_THUMB_PX), [imageUrl]);
  // The switch outranks the estimate: a dish that is off has no "left".
  const hint = isSoldOut ? null : stockHint;
  const baseLabel = isInSale
    ? `${name}, ${formatPeso(price)}, ${quantity} in sale`
    : `${name}, ${formatPeso(price)}`;
  const accessibilityLabel = isSoldOut
    ? `${name}, sold out`
    : hint
      ? `${baseLabel}, ${hint.label}`
      : baseLabel;

  return (
    <TouchableOpacity
      style={[styles.tile, isInSale && styles.tileInSale, isSoldOut && styles.tileSoldOut]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ disabled: isSoldOut }}
      accessibilityLabel={accessibilityLabel}
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

        {isSoldOut ? (
          <View style={styles.soldOutVeil}>
            <Text style={styles.soldOutText}>Sold out</Text>
          </View>
        ) : null}

        {hint ? (
          <View style={[styles.stockPill, hint.isOut && styles.stockPillOut]}>
            <Text style={[styles.stockPillText, hint.isOut && styles.stockPillTextOut]}>{hint.label}</Text>
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
  tileSoldOut: { opacity: 0.55 },
  soldOutVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(29,24,21,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  soldOutText: { ...typography.caption, fontWeight: "800", color: colors.textOnDark },
  stockPill: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    ...shadow.sm,
  },
  stockPillOut: { backgroundColor: colors.danger },
  stockPillText: { ...typography.small, fontWeight: "700", color: colors.warning },
  stockPillTextOut: { color: colors.textOnDark },
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
