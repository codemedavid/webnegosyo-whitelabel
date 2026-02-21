import React from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import { setAlpha } from '@/lib/branding-utils'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface MenuItemCardProps {
  item: MenuItem
  onPress: () => void
  numColumns: number
  hideCurrencySymbol?: boolean
}

export function MenuItemCard({ item, onPress, numColumns, hideCurrencySymbol }: MenuItemCardProps) {
  const { theme } = useTheme()
  const isGrid = numColumns === 2
  const hasDiscount = item.discounted_price != null && item.discounted_price < item.price
  const hasVariations = (item.variations && item.variations.length > 0) ||
    (item.variation_types && item.variation_types.length > 0)

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.cards,
          borderColor: theme.cardsBorder,
          shadowColor: '#000',
        },
        isGrid ? styles.gridCard : styles.listCard,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Image with overlays */}
      <View style={isGrid ? styles.gridImageWrapper : styles.listImageWrapper}>
        <OptimizedImage
          source={item.image_url}
          style={isGrid ? styles.gridImage : styles.listImage}
        />

        {/* Unavailable overlay */}
        {!item.is_available ? (
          <View style={styles.unavailableOverlay}>
            <Text style={styles.unavailableText}>Unavailable</Text>
          </View>
        ) : null}

        {/* Badge overlays */}
        {item.badge_text ? (
          <View style={styles.badgeOverlay}>
            <Badge text={item.badge_text} variant="primary" />
          </View>
        ) : item.is_featured ? (
          <View style={styles.badgeOverlay}>
            <Text style={styles.starBadge}>⭐</Text>
          </View>
        ) : null}

        {/* Sale badge */}
        {hasDiscount ? (
          <View style={styles.saleOverlay}>
            <Badge text="SALE" variant="sale" />
          </View>
        ) : null}

        {/* Add to cart button */}
        {item.is_available !== false ? (
          <View style={[styles.addButtonWrapper]}>
            <View style={[styles.addButton, { backgroundColor: theme.buttonPrimary }]}>
              <Ionicons name="add" size={20} color={theme.buttonPrimaryText} />
            </View>
          </View>
        ) : null}
      </View>

      {/* Content */}
      <View style={[styles.content, isGrid && styles.gridContent]}>
        <Text
          style={[styles.name, { color: theme.cardTitle }]}
          numberOfLines={isGrid ? 2 : 1}
        >
          {item.name}
        </Text>
        {!isGrid && item.description ? (
          <Text
            style={[styles.description, { color: theme.cardDescription }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          {hasDiscount ? (
            <>
              <Text style={[styles.price, { color: theme.cardPrice }]}>
                {hasVariations ? 'from ' : ''}{formatPrice(item.discounted_price!, { hideCurrencySymbol })}
              </Text>
              <Text style={[styles.originalPrice, { color: theme.textMuted }]}>
                {formatPrice(item.price, { hideCurrencySymbol })}
              </Text>
            </>
          ) : (
            <Text style={[styles.price, { color: theme.cardPrice }]}>
              {hasVariations ? 'from ' : ''}{formatPrice(item.price, { hideCurrencySymbol })}
            </Text>
          )}
        </View>
        {hasVariations && !isGrid ? (
          <View style={[styles.variantBadge, { backgroundColor: setAlpha(theme.buttonPrimary, 0.08) }]}>
            <Text style={[styles.variantBadgeText, { color: theme.buttonPrimary }]}>
              {(item.variations?.length || 0) + (item.variation_types?.length || 0)} options
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  listCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  gridCard: {
    flex: 1,
    marginBottom: 12,
  },
  gridImageWrapper: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
  listImageWrapper: {
    width: 110,
    height: 110,
    position: 'relative',
  },
  listImage: {
    width: 110,
    height: 110,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  badgeOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
  },
  saleOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  starBadge: {
    fontSize: 18,
  },
  addButtonWrapper: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    zIndex: 10,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  content: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  gridContent: {
    padding: 10,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
  },
  originalPrice: {
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  variantBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
  },
  variantBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
})
