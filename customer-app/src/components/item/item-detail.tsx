import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { defaultSelections, unitPriceCentavos, type Selections } from '@/lib/cart/pricing'
import type { AppMenuItem } from '@/lib/contract'
import { firstUnmetGroupId } from '@/lib/item/groups'
import { buildCartLine, clampItemQuantity } from '@/lib/item/line'
import { formatPeso, toCentavos } from '@/lib/money'
import { nextLineId, useCart } from '@/lib/stores/cart'
import { MAX_LINE_QUANTITY } from '@/lib/cart/cart'
import { useTokens } from '@/theme/theme-context'
import { AddBar } from './add-bar'
import { ItemHero } from './item-hero'
import { ModifierGroupSection } from './modifier-group-section'
import { QuantityStepper } from './quantity-stepper'

/** Leaves the group's header in view, below the modal's top edge. */
const SCROLL_MARGIN = 12

function ItemInfo({ item }: { item: AppMenuItem }) {
  const { space } = useTokens()
  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>
      {item.badge ? (
        <AppText variant="label" color="primary" style={{ marginBottom: space.xs }}>
          {item.badge.toUpperCase()}
        </AppText>
      ) : null}
      <AppText variant="display" accessibilityRole="header">
        {item.name}
      </AppText>
      {item.description ? (
        <AppText variant="body" color="textMuted" style={{ marginTop: space.sm }}>
          {item.description}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.md }}>
        {item.isAvailable ? (
          <AppText variant="title">{formatPeso(toCentavos(item.price))}</AppText>
        ) : (
          <AppText variant="headline" color="danger">
            Sold out today
          </AppText>
        )}
        {item.compareAtPrice && item.isAvailable ? (
          <AppText variant="body" color="textMuted" style={{ textDecorationLine: 'line-through' }}>
            {formatPeso(toCentavos(item.compareAtPrice))}
          </AppText>
        ) : null}
      </View>
    </View>
  )
}

/** The customise-and-add screen for one dish. Keyed by item id, so state starts fresh per dish. */
export function ItemDetail({ item }: { item: AppMenuItem }) {
  const { colors, space } = useTokens()
  const add = useCart((state) => state.add)
  const [selections, setSelections] = useState<Selections>(() => defaultSelections(item))
  const [quantity, setQuantity] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const groupOffsets = useRef<Record<string, number>>({})

  const unmetGroupId = firstUnmetGroupId(item, selections)
  const totalCentavos = unitPriceCentavos(item, selections) * quantity

  const onAdd = () => {
    if (unmetGroupId) {
      setAttempt((value) => value + 1)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      const y = groupOffsets.current[unmetGroupId]
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - SCROLL_MARGIN), animated: true })
      return
    }
    add(buildCartLine(item, selections, quantity, nextLineId()))
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.replace('/added')
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        <ItemHero uri={item.imageUrl} name={item.name} isSoldOut={!item.isAvailable} />
        <ItemInfo item={item} />
        {item.modifierGroups.map((group) => (
          <ModifierGroupSection
            key={group.id}
            group={group}
            selections={selections}
            onChange={setSelections}
            attempt={attempt}
            showIssue={attempt > 0 && group.id === unmetGroupId}
            onLayout={(event) => (groupOffsets.current[group.id] = event.nativeEvent.layout.y)}
          />
        ))}
        {item.isAvailable ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginHorizontal: space.lg,
              marginTop: space.xl,
              paddingTop: space.lg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <AppText variant="headline">Quantity</AppText>
            <QuantityStepper
              label="Quantity"
              value={quantity}
              min={1}
              max={MAX_LINE_QUANTITY}
              onChange={(next) => setQuantity(clampItemQuantity(next))}
            />
          </View>
        ) : null}
      </ScrollView>
      <AddBar totalCentavos={totalCentavos} isSoldOut={!item.isAvailable} onAdd={onAdd} />
    </View>
  )
}
