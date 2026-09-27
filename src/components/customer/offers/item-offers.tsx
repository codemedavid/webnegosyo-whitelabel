'use client'

import { useEffect, useMemo, useRef } from 'react'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { bundleToMenuItem } from '@/lib/bundle-adapter'
import { formatPrice } from '@/lib/cart-utils'
import type { BundleWithSlots, MenuItem, UpgradeUpsell } from '@/types/database'
import { ItemOfferChoice, type ItemOfferOption } from './item-offer-choice'
import type { OfferTheme } from './offer-theme'

/** Keeps the upsell report continuous with the prompt this replaces. */
const ANALYTICS_SOURCE = 'inline_upgrade'
const MAX_OPTIONS = 3

interface ItemOffersProps {
  item: MenuItem
  upgrades: readonly UpgradeUpsell[]
  /** Combos that contain THIS item — never every combo in the store. */
  combos: readonly BundleWithSlots[]
  theme: OfferTheme
  hideCurrencySymbol?: boolean
  tenantId: string
  onChooseUpgrade: (upgrade: UpgradeUpsell) => void
  onChooseCombo: (combo: BundleWithSlots) => void
}

function comboPrice(combo: BundleWithSlots): number {
  const card = bundleToMenuItem(combo)
  return card.discounted_price ?? card.price
}

function comboImage(combo: BundleWithSlots): string | null {
  if (combo.image_url) return combo.image_url
  return combo.slots?.flatMap((slot) => slot.items ?? []).find((i) => i.image_url)?.image_url ?? null
}

/** The item page's upgrade moment: this item, its bigger version, its combos. */
export function ItemOffers({
  item,
  upgrades,
  combos,
  theme,
  hideCurrencySymbol,
  tenantId,
  onChooseUpgrade,
  onChooseCombo,
}: ItemOffersProps) {
  const format = (amount: number) => formatPrice(amount, { hideCurrencySymbol })

  const options = useMemo<ItemOfferOption[]>(() => [
    ...upgrades.map((upgrade) => ({
      id: `upgrade:${upgrade.targetItem.id}`,
      label: upgrade.targetLabel || upgrade.targetItem.name,
      priceLabel: `+${formatPrice(Math.max(0, upgrade.targetItem.price - item.price), { hideCurrencySymbol })}`,
      imageUrl: upgrade.targetItem.image_url,
    })),
    ...combos.map((combo) => ({
      id: `combo:${combo.id}`,
      label: combo.name,
      note: 'Combo',
      priceLabel: `+${formatPrice(Math.max(0, comboPrice(combo) - item.price), { hideCurrencySymbol })}`,
      imageUrl: comboImage(combo),
    })),
  ].slice(0, MAX_OPTIONS), [upgrades, combos, item.price, hideCurrencySymbol])

  const trackedFor = useRef<string | null>(null)
  useEffect(() => {
    if (options.length === 0 || trackedFor.current === item.id) return
    trackedFor.current = item.id
    trackAnalyticsEventAction(tenantId, 'upsell_shown', {
      source: ANALYTICS_SOURCE,
      sourceItemId: item.id,
      upgradeCount: upgrades.length,
      bundleCount: combos.length,
    })
  }, [options.length, item.id, tenantId, upgrades.length, combos.length])

  if (options.length === 0) return null

  const header = upgrades[0]?.upgradeHeader || (upgrades.length === 0 ? 'Make it a combo?' : 'Make it a meal?')
  const current: ItemOfferOption = {
    id: item.id,
    label: upgrades[0]?.sourceLabel || `Just the ${item.name}`,
    priceLabel: format(item.price),
    imageUrl: item.image_url,
  }

  const handleChoose = (optionId: string) => {
    const [kind, id] = optionId.split(':')
    if (kind === 'upgrade') {
      const upgrade = upgrades.find((u) => u.targetItem.id === id)
      if (!upgrade) return
      trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
        source: ANALYTICS_SOURCE, type: 'upgrade', itemId: id, sourceItemId: item.id,
      })
      onChooseUpgrade(upgrade)
      return
    }
    const combo = combos.find((c) => c.id === id)
    if (!combo) return
    trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
      source: ANALYTICS_SOURCE, type: 'bundle', bundleId: id, sourceItemId: item.id,
    })
    onChooseCombo(combo)
  }

  return <ItemOfferChoice header={header} current={current} options={options} theme={theme} onChoose={handleChoose} />
}

/**
 * Combos worth offering on this item's page: active, marked "suggest on its
 * items", and actually containing the item. The old page offered the store's
 * first combo on every product, related or not.
 */
export function combosContainingItem(combos: readonly BundleWithSlots[], itemId: string): BundleWithSlots[] {
  return combos.filter((combo) =>
    combo.is_active !== false &&
    combo.show_as_upsell !== false &&
    (combo.slots ?? []).some((slot) =>
      (slot.included_item_ids ?? []).includes(itemId) || (slot.items ?? []).some((slotItem) => slotItem.id === itemId)
    )
  )
}
