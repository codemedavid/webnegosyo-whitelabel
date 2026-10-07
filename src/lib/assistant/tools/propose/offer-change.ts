/**
 * propose_offer_change — pause, resume or re-price an offer that already
 * exists (an offer ref from get_live_offers). Pausing is the assistant's
 * "remove": it hides the offer from customers and keeps it for later, and
 * there is no delete tool.
 */

import { z } from 'zod'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { readBoostWorkspace } from '@/lib/assistant/data/boost'
import { decodeOfferTarget } from '@/lib/assistant/insights/offer-target'
import { comboPricing } from '@/lib/assistant/tools/reads/live-offers'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { OfferChangePayload, OfferTarget } from '@/lib/assistant/actions/kinds'
import type { BoostWorkspace } from '@/lib/boost/workspace'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ConfirmCard } from '@/lib/assistant/types'

const input = z.object({
  offer: z.string().describe('Offer ref from get_live_offers'),
  change: z.enum(['pause', 'resume', 'price']),
  price: z.number().positive().nullable().describe('New combo price; only for change=price'),
})
type Input = z.infer<typeof input>

interface FoundOffer {
  name: string
  isOn: boolean
  combo: BoostWorkspace['combos'][number] | null
}

function findOffer(workspace: BoostWorkspace, target: OfferTarget): FoundOffer | null {
  const nameOf = (id: string) => workspace.items.find((item) => item.id === id)?.name ?? 'a dish'
  if (target.kind === 'combo') {
    const combo = workspace.combos.find((row) => row.id === target.id)
    return combo ? { name: combo.name, isOn: combo.is_active, combo } : null
  }
  if (target.kind === 'upgrade') {
    const upgrade = workspace.upgrades.find((row) => row.id === target.id)
    return upgrade ? { name: `${nameOf(upgrade.sourceId)} → ${nameOf(upgrade.targetId)}`, isOn: upgrade.isActive, combo: null } : null
  }
  const wanted = [...target.sourceIds].sort().join(',')
  const pairing = workspace.pairings.find((row) => [...row.sourceIds].sort().join(',') === wanted)
  return pairing ? { name: `After ${pairing.sourceIds.map(nameOf).join(', ')}`, isOn: pairing.isActive, combo: null } : null
}

function numberOrNull(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

const KIND_LABEL: Record<OfferTarget['kind'], string> = { combo: 'combo', upgrade: 'upgrade', pairing: 'pairing' }

export const proposeOfferChangeTool: AssistantToolDef<Input> = {
  name: 'propose_offer_change',
  description: 'Propose pausing, resuming or re-pricing (combos only) an existing offer. The user must confirm.',
  access: { permission: 'analytics' },
  input,
  async run(ctx, request) {
    const target = decodeOfferTarget(ctx.refs.resolve(request.offer, 'offer'))
    if (!target) return refused('Unknown offer ref. Call get_live_offers first.')
    const workspace = await readBoostWorkspace(ctx)
    if (!workspace) return refused('Store settings could not be read.')
    const offer = findOffer(workspace, target)
    if (!offer) return refused('That offer no longer exists. Call get_live_offers again.')

    const lines: ConfirmCard['lines'] = [{ label: KIND_LABEL[target.kind][0].toUpperCase() + KIND_LABEL[target.kind].slice(1), value: offer.name }]
    let price: number | null = null

    if (request.change === 'price') {
      if (!offer.combo || request.price === null) return refused('Only a combo can be re-priced, and it needs a price.')
      const pricing = comboPricing(offer.combo, workspace)
      if (pricing.regularPrice > 0 && request.price >= pricing.regularPrice) {
        return refused(`A combo must cost less than its dishes separately (${formatPeso(pricing.regularPrice)}), or nobody saves.`)
      }
      price = Math.round(request.price * 100) / 100
      lines.push({ label: 'Price', value: `${pricing.price !== null ? formatPeso(pricing.price) : 'Not set'} → ${formatPeso(price)}` })
      lines.push({ label: 'Regular', value: formatPeso(pricing.regularPrice) })
    } else {
      const wantsOn = request.change === 'resume'
      if (offer.isOn === wantsOn) return refused(`That ${KIND_LABEL[target.kind]} is already ${wantsOn ? 'on' : 'paused'}.`)
      lines.push({ label: 'Change', value: wantsOn ? 'Show it to customers again' : 'Hide it from customers (kept, can resume)' })
    }

    const expected = offer.combo
      ? { isActive: offer.isOn, fixedPrice: numberOrNull(offer.combo.fixed_price), discountPercent: numberOrNull(offer.combo.discount_percent) }
      : { isActive: offer.isOn }
    const payload: OfferChangePayload = { target, change: request.change, price, name: offer.name, expected }
    const verb = request.change === 'price' ? 'Re-price' : request.change === 'pause' ? 'Pause' : 'Resume'
    return fileProposal(ctx, {
      kind: 'offer_change',
      payload,
      summary: `${verb} ${KIND_LABEL[target.kind]} "${offer.name}"${price !== null ? ` to ${formatPeso(price)}` : ''}`,
      title: `${verb} ${KIND_LABEL[target.kind]}`,
      lines,
      warning: workspace.isEnabled ? 'Changes your storefront when you confirm.' : 'Boost Sales is off, so customers will not see it until it is on.',
    })
  },
}
