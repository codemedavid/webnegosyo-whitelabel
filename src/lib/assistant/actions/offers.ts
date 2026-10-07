/**
 * Turn the model's combo / upsell request into a validated Boost offer, using
 * the SAME validator Boost Sales AI uses (`normalizeAiProposals`): every dish
 * must be available on this menu, an upgrade must cost more, a combo must be
 * cheaper than buying separately, nothing may duplicate a live offer.
 * Anything that fails is refused — never repaired into a guess.
 */

import { buildGenerationInputs } from '@/lib/boost/ai/generate'
import { normalizeAiProposals } from '@/lib/boost/ai/proposals'
import type { BoostIdea } from '@/lib/boost/ideas'
import type { BoostWorkspace } from '@/lib/boost/workspace'
import type { BasketSummary } from '@/lib/boost/order-baskets'
import type { RefSnapshot } from '@/lib/assistant/refs'

const NO_BASKETS: BasketSummary = {
  dataSource: 'platform',
  isAvailable: false,
  note: null,
  windowLabel: '',
  orderCount: 0,
  itemOrders: {},
  pairs: [],
}

export interface OfferRequest {
  combos?: unknown[]
  upgrades?: unknown[]
  pairings?: unknown[]
}

/** The item refs this conversation has issued, as the validator's ref map. */
export function itemRefMap(snapshot: RefSnapshot): Record<string, string> {
  return Object.fromEntries(
    Object.entries(snapshot.refs).flatMap(([ref, entry]) => (entry.kind === 'item' ? [[ref, entry.id]] : [])),
  )
}

export function validateOffer(request: OfferRequest, workspace: BoostWorkspace, refToId: Record<string, string>): BoostIdea | null {
  const { context } = buildGenerationInputs(workspace, NO_BASKETS)
  const normalized = normalizeAiProposals(
    { summary: '', combos: request.combos ?? [], upgrades: request.upgrades ?? [], pairings: request.pairings ?? [] },
    { ...context, refToId },
  )
  return normalized.ideas[0] ?? null
}
