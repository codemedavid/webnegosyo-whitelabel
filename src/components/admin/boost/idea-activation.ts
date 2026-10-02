import {
  deleteBoostComboAction,
  deleteBoostPairingAction,
  deleteBoostUpgradeAction,
  saveBoostComboAction,
  saveBoostLastCallAction,
  saveBoostPairingAction,
  saveBoostUpgradeAction,
} from '@/app/actions/boost'
import { ideaToWrite } from '@/lib/boost/idea-writes'
import type { BoostIdea } from '@/lib/boost/ideas'
import type { BoostLastCall } from '@/lib/boost/workspace'
import type { ItemLookup } from './boost-model'

export type ActivationResult =
  | { status: 'live'; message: string; undo: () => Promise<void> }
  /** The idea cannot go live as-is (e.g. an item has no category) — edit it. */
  | { status: 'needs-edit' }
  | { status: 'failed'; error: string }

interface ActivationContext {
  tenantId: string
  tenantSlug: string
  itemsById: ItemLookup
  lastCall: BoostLastCall
}

async function ignoreResult(promise: Promise<unknown>): Promise<void> {
  await promise
}

/** Turn one "Ready to go" idea into a live offer, with a way back. */
export async function activateIdea(idea: BoostIdea, ctx: ActivationContext): Promise<ActivationResult> {
  const { tenantId, tenantSlug } = ctx
  const write = ideaToWrite(idea, ctx.itemsById, ctx.lastCall)

  switch (write.kind) {
    case 'needs-edit':
      return { status: 'needs-edit' }

    case 'combo': {
      const response = await saveBoostComboAction(tenantId, tenantSlug, null, write.input)
      if (!response.success) return { status: 'failed', error: response.error }
      const comboId = response.data
      return {
        status: 'live',
        message: `${write.input.name} is live on your menu`,
        undo: () => (comboId ? ignoreResult(deleteBoostComboAction(tenantId, tenantSlug, comboId)) : Promise.resolve()),
      }
    }

    case 'upgrade': {
      const response = await saveBoostUpgradeAction(tenantId, tenantSlug, write.input)
      if (!response.success) return { status: 'failed', error: response.error }
      const upgradeId = response.data
      return {
        status: 'live',
        message: 'Upgrade is live on the item page',
        undo: () => (upgradeId ? ignoreResult(deleteBoostUpgradeAction(tenantId, tenantSlug, upgradeId)) : Promise.resolve()),
      }
    }

    case 'pairing': {
      const response = await saveBoostPairingAction(tenantId, tenantSlug, write.input)
      if (!response.success) return { status: 'failed', error: response.error }
      const label = idea.kind === 'pairing' ? idea.categoryName : 'these dishes'
      return {
        status: 'live',
        message: `Customers adding ${label} now see suggestions`,
        undo: () => ignoreResult(deleteBoostPairingAction(tenantId, tenantSlug, write.input.sourceIds)),
      }
    }

    case 'last_call': {
      const response = await saveBoostLastCallAction(tenantId, tenantSlug, write.input)
      if (!response.success) return { status: 'failed', error: response.error }
      return {
        status: 'live',
        message: 'Your cart now suggests add-ons',
        undo: () => ignoreResult(saveBoostLastCallAction(tenantId, tenantSlug, write.undo)),
      }
    }
  }
}
