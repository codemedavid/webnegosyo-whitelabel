/**
 * get_live_offers — every combo, upgrade and pairing the store has set up (on
 * or paused), the cart's last call, and the last 30 days of combo orders. Each
 * offer carries a ref so a later turn can pause, resume or re-price it.
 */

import { z } from 'zod'
import type { BoostWorkspace } from '@/lib/boost/workspace'
import { comboDraftFromBundle, comboDraftPrice, comboDraftRegularPrice } from '@/lib/boost/combo-draft'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { readBoostWorkspace } from '@/lib/assistant/data/boost'
import { encodeOfferTarget } from '@/lib/assistant/insights/offer-target'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

/** Per kind: the card and the facts stay small even on a busy Boost page. */
const PER_KIND_LIMIT = 8

const input = z.object({ kind: z.enum(['all', 'combos', 'upgrades', 'pairings']).describe('Default all') })
type Input = z.infer<typeof input>

interface OfferRow {
  ref: string
  kind: 'combo' | 'upgrade' | 'pairing'
  name: string
  isOn: boolean
  detail: string
  price?: number
  regularPrice?: number
  orders30d?: number
}

export interface ComboPricing {
  price: number | null
  regularPrice: number
}

/** What a stored combo charges and what its dishes cost separately (the storefront's rule). */
export function comboPricing(combo: BoostWorkspace['combos'][number], workspace: BoostWorkspace): ComboPricing {
  const lookup = new Map(workspace.items.map((item) => [item.id, item]))
  const draft = comboDraftFromBundle(combo, workspace.items)
  return { price: comboDraftPrice(draft, lookup), regularPrice: comboDraftRegularPrice(draft, lookup) }
}

function listOffers(workspace: BoostWorkspace, kind: Input['kind'], refs: RefBook): OfferRow[] {
  const nameOf = (id: string) => workspace.items.find((item) => item.id === id)?.name ?? 'a dish'
  const names = (ids: readonly string[]) => ids.map(nameOf).join(', ')
  const rows: OfferRow[] = []

  if (kind === 'all' || kind === 'combos') {
    for (const combo of workspace.combos.slice(0, PER_KIND_LIMIT)) {
      const { price, regularPrice } = comboPricing(combo, workspace)
      rows.push({
        ref: refs.refFor('offer', encodeOfferTarget({ kind: 'combo', id: combo.id })),
        kind: 'combo',
        name: combo.name,
        isOn: combo.is_active,
        detail: price !== null ? `${formatPeso(price)} (regular ${formatPeso(regularPrice)})` : 'Price not set',
        ...(price !== null ? { price } : {}),
        regularPrice,
        orders30d: workspace.performance?.comboOrders[combo.id] ?? 0,
      })
    }
  }
  if (kind === 'all' || kind === 'upgrades') {
    for (const upgrade of workspace.upgrades.slice(0, PER_KIND_LIMIT)) {
      rows.push({
        ref: refs.refFor('offer', encodeOfferTarget({ kind: 'upgrade', id: upgrade.id })),
        kind: 'upgrade',
        name: `${nameOf(upgrade.sourceId)} → ${nameOf(upgrade.targetId)}`,
        isOn: upgrade.isActive,
        detail: upgrade.header ?? 'Upgrade on the item page',
      })
    }
  }
  if (kind === 'all' || kind === 'pairings') {
    for (const pairing of workspace.pairings.slice(0, PER_KIND_LIMIT)) {
      rows.push({
        ref: refs.refFor('offer', encodeOfferTarget({ kind: 'pairing', sourceIds: pairing.sourceIds })),
        kind: 'pairing',
        name: `After ${names(pairing.sourceIds)}`,
        isOn: pairing.isActive,
        detail: `Suggest ${names(pairing.targetIds)}`,
      })
    }
  }
  return rows
}

const BADGE: Record<OfferRow['kind'], string> = { combo: 'Combo', upgrade: 'Upgrade', pairing: 'Pairing' }

export function buildLiveOffersResult(workspace: BoostWorkspace, kind: Input['kind'], refs: RefBook): ToolResult {
  const offers = listOffers(workspace, kind, refs)
  const lastCall = workspace.lastCall
  const nameOf = (id: string) => workspace.items.find((item) => item.id === id)?.name
  return {
    facts: {
      boostSalesOn: workspace.isEnabled,
      totals: { combos: workspace.combos.length, upgrades: workspace.upgrades.length, pairings: workspace.pairings.length },
      offers: offers.map(({ ref, kind: offerKind, name, isOn, price, regularPrice, orders30d }) => ({
        ref,
        kind: offerKind,
        name,
        status: isOn ? 'on' : 'paused',
        ...(price !== undefined ? { price } : {}),
        ...(regularPrice !== undefined ? { regularPrice } : {}),
        ...(orders30d !== undefined && workspace.performance ? { orders30d } : {}),
      })),
      cartLastCall: {
        on: lastCall.enabled,
        title: lastCall.title,
        picks: lastCall.pickedItemIds.length > 0 ? lastCall.pickedItemIds.map(nameOf).filter(Boolean).slice(0, 8) : 'automatic',
      },
      ...(workspace.performance
        ? { suggestionSales30d: workspace.performance.suggestions }
        : { performanceNote: 'Offer performance is only tracked for stores on the platform order backend.' }),
    },
    card: {
      type: 'ranked',
      title: 'Your offers',
      subtitle: workspace.isEnabled ? 'Boost Sales is on' : 'Boost Sales is off — nothing shows to customers',
      rows: offers.map((offer) => ({
        label: offer.name,
        value: offer.isOn ? 'On' : 'Paused',
        detail: offer.orders30d !== undefined && workspace.performance ? `${offer.detail} · ${offer.orders30d} orders in 30 days` : offer.detail,
        badge: BADGE[offer.kind],
      })),
      emptyText: 'No offers yet. Ask me for offer ideas to get started.',
    },
    chips: offers.length === 0 ? [{ label: 'Offer ideas', prompt: 'Give me offer ideas' }] : [{ label: 'New offer ideas', prompt: 'Give me new offer ideas' }],
    links: [{ label: 'Open Boost Sales', path: '/boost-sales' }],
  }
}

export const getLiveOffersTool: AssistantToolDef<Input> = {
  name: 'get_live_offers',
  description: 'Combos, upgrades and pairings already set up (on/paused, combo orders 30d) and the cart last call.',
  access: { permission: 'analytics' },
  input,
  async run(ctx, { kind }) {
    const workspace = await readBoostWorkspace(ctx)
    if (!workspace) return { facts: { available: false, reason: 'Store settings could not be read.' } }
    return buildLiveOffersResult(workspace, kind, ctx.refs)
  },
}
