/**
 * Put one approved AI proposal live, server-side.
 *
 * The offer applied is the one STORED at generation time (already validated
 * against the menu), never one sent back by the browser. The shared
 * `ideaToWrite` mapping makes it go live exactly like a one-tap "Turn on";
 * each underlying write re-checks the caller's permission and that every item
 * still belongs to this store.
 *
 * `ctx` is for callers that authorized the request themselves (the merchant
 * app's bearer route): the writes then run on its service-role client.
 */

import { createBundle } from '@/lib/bundles-service'
import { saveBoostLastCall, saveBoostPairing, saveBoostUpgrade } from '../writes'
import { ideaToWrite } from '../idea-writes'
import type { BoostIdea } from '../ideas'
import type { BoostItem, BoostLastCall } from '../workspace'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

export type ApplyResult =
  | { status: 'applied'; ref: string | null }
  | { status: 'needs-edit' }

export async function applyBoostIdea(
  tenantId: string,
  idea: BoostIdea,
  menu: { items: readonly BoostItem[]; lastCall: BoostLastCall },
  ctx?: ProvisioningCtx
): Promise<ApplyResult> {
  const itemsById = new Map(menu.items.map((item) => [item.id, item]))
  const write = ideaToWrite(idea, itemsById, menu.lastCall)

  switch (write.kind) {
    case 'needs-edit':
      return { status: 'needs-edit' }
    case 'combo': {
      const bundle = await createBundle(tenantId, write.input, ctx)
      return { status: 'applied', ref: bundle.id }
    }
    case 'upgrade':
      return { status: 'applied', ref: await saveBoostUpgrade(tenantId, write.input, ctx) }
    case 'pairing':
      await saveBoostPairing(tenantId, write.input, ctx)
      return { status: 'applied', ref: null }
    case 'last_call':
      await saveBoostLastCall(tenantId, write.input, ctx)
      return { status: 'applied', ref: null }
  }
}
