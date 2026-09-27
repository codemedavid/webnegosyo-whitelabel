import {
  deleteBoostComboAction,
  deleteBoostPairingAction,
  deleteBoostUpgradeAction,
  saveBoostComboAction,
  saveBoostLastCallAction,
  saveBoostPairingAction,
  saveBoostUpgradeAction,
} from '@/app/actions/boost'
import { comboDraftFromIdea, comboDraftToInput } from '@/lib/boost/combo-draft'
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

  if (idea.kind === 'combo') {
    const draft = comboDraftToInput(comboDraftFromIdea(idea), ctx.itemsById)
    if (!draft.ok) return { status: 'needs-edit' }
    const response = await saveBoostComboAction(tenantId, tenantSlug, null, draft.input)
    if (!response.success) return { status: 'failed', error: response.error }
    const comboId = response.data
    return {
      status: 'live',
      message: `${idea.name} is live on your menu`,
      undo: () => (comboId ? ignoreResult(deleteBoostComboAction(tenantId, tenantSlug, comboId)) : Promise.resolve()),
    }
  }

  if (idea.kind === 'upgrade') {
    const response = await saveBoostUpgradeAction(tenantId, tenantSlug, {
      sourceId: idea.sourceId,
      targetId: idea.targetId,
      header: idea.header,
      sourceLabel: null,
      targetLabel: null,
      isActive: true,
    })
    if (!response.success) return { status: 'failed', error: response.error }
    const upgradeId = response.data
    return {
      status: 'live',
      message: 'Upgrade is live on the item page',
      undo: () => (upgradeId ? ignoreResult(deleteBoostUpgradeAction(tenantId, tenantSlug, upgradeId)) : Promise.resolve()),
    }
  }

  if (idea.kind === 'pairing') {
    const response = await saveBoostPairingAction(tenantId, tenantSlug, {
      previousSourceIds: [],
      sourceIds: idea.sourceIds,
      targetIds: idea.targetIds,
      isActive: true,
    })
    if (!response.success) return { status: 'failed', error: response.error }
    return {
      status: 'live',
      message: `Customers adding ${idea.categoryName} now see suggestions`,
      undo: () => ignoreResult(deleteBoostPairingAction(tenantId, tenantSlug, idea.sourceIds)),
    }
  }

  const settings = {
    title: ctx.lastCall.title,
    subtitle: ctx.lastCall.subtitle,
    maxItems: Math.min(8, Math.max(2, ctx.lastCall.maxItems)),
    pickedItemIds: ctx.lastCall.pickedItemIds,
  }
  const response = await saveBoostLastCallAction(tenantId, tenantSlug, { ...settings, enabled: true })
  if (!response.success) return { status: 'failed', error: response.error }
  return {
    status: 'live',
    message: 'Your cart now suggests add-ons',
    undo: () => ignoreResult(saveBoostLastCallAction(tenantId, tenantSlug, { ...settings, enabled: false })),
  }
}
