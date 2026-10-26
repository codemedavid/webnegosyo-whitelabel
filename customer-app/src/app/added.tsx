import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PairingCard } from '@/components/item/pairing-card'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { ItemImage } from '@/components/ui/item-image'
import type { CartLine } from '@/lib/cart/cart'
import { defaultSelections } from '@/lib/cart/pricing'
import { useCatalog } from '@/lib/data/hooks'
import { buildCartLine } from '@/lib/item/line'
import { pairingsFor } from '@/lib/item/pairings'
import { formatPeso } from '@/lib/money'
import { nextLineId, useCart, useCartSummary } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

const THUMB = 56
/**
 * A fixed row, not a carousel: inside a native form sheet a nested ScrollView
 * loses its frame (react-native-screens claims the sheet's scroll views).
 */
const SHEET_PAIRINGS = 3
const PAIRING_GAP = 12

function AddedLine({ line }: { line: CartLine }) {
  const { colors, space, radius } = useTokens()
  return (
    <View
      accessible
      accessibilityLabel={`${line.quantity} ${line.name}${line.optionLabels.length ? `, ${line.optionLabels.join(', ')}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface }}
    >
      <ItemImage uri={line.imageUrl} name={line.name} radius={radius.md} style={{ width: THUMB, height: THUMB }} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {line.quantity > 1 ? `${line.quantity}× ` : ''}
          {line.name}
        </AppText>
        {line.optionLabels.length > 0 ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {line.optionLabels.join(' · ')}
          </AppText>
        ) : null}
      </View>
      <AppText variant="price">{formatPeso(line.unitCentavos * line.quantity)}</AppText>
    </View>
  )
}

/** After an add: what went in, what goes well with it (Boost Sales pairings), then bag or back to the menu. */
export default function AddedSheet() {
  const { colors, space } = useTokens()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const cardWidth = (width - space.lg * 2 - PAIRING_GAP * (SHEET_PAIRINGS - 1)) / SHEET_PAIRINGS
  const { data: catalog } = useCatalog()
  const add = useCart((state) => state.add)
  // Frozen at open, so a quick-added pairing keeps its card (with a tick) instead of vanishing.
  const [line] = useState(() => useCart.getState().lastAdded)
  const [bagItemIds] = useState(() => useCart.getState().lines.map((bagLine) => bagLine.itemId))
  const [addedIds, setAddedIds] = useState<readonly string[]>([])
  const { subtotalCentavos } = useCartSummary()

  const pairings = useMemo(
    () => (catalog && line ? pairingsFor(catalog, line.itemId, bagItemIds) : []),
    [catalog, line, bagItemIds],
  )

  const quickAdd = (itemId: string) => {
    const item = catalog?.items.find((candidate) => candidate.id === itemId)
    if (!item) return
    add(buildCartLine(item, defaultSelections(item), 1, nextLineId()))
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setAddedIds((ids) => [...ids, itemId])
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingTop: space.lg, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}
            >
              <Check size={20} color={colors.onPrimary} strokeWidth={3} />
            </View>
            <AppText variant="title" accessibilityRole="header" accessibilityLiveRegion="polite">
              Added to your bag
            </AppText>
          </View>
          {line ? <AddedLine line={line} /> : null}
        </View>

        {pairings.length > 0 ? (
          <View style={{ marginTop: space.lg }}>
            <AppText variant="headline" accessibilityRole="header" style={{ paddingHorizontal: space.lg, marginBottom: space.md }}>
              Goes well with
            </AppText>
            <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, gap: PAIRING_GAP }}>
              {pairings.slice(0, SHEET_PAIRINGS).map((item) => (
                <PairingCard
                  key={item.id}
                  item={item}
                  width={cardWidth}
                  isAdded={addedIds.includes(item.id)}
                  onOpen={() => router.replace({ pathname: '/item/[id]', params: { id: item.id } })}
                  onQuickAdd={() => quickAdd(item.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
      {/* Pinned, so the bag is one tap away even at the sheet's half-height detent. */}
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: Math.max(insets.bottom, space.lg),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <Button label="Keep browsing" variant="secondary" onPress={() => router.back()} style={{ flex: 1, paddingHorizontal: space.md }} />
        <Button
          label={`View bag · ${formatPeso(subtotalCentavos)}`}
          onPress={() => router.replace('/checkout')}
          style={{ flex: 1.4, paddingHorizontal: space.md }}
        />
      </View>
    </View>
  )
}
