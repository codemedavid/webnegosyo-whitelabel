/**
 * propose_offer — a combo, upgrade or pairing for the owner to confirm, either
 * one of get_boost_ideas' ready-made ideas or the owner's own design.
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBoostWorkspace, type BoostTenantFields, type BoostWorkspace } from '@/lib/boost/workspace'
import type { BoostIdea } from '@/lib/boost/ideas'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { itemRefMap, validateOffer } from '@/lib/assistant/actions/offers'
import type { OfferPayload } from '@/lib/assistant/actions/kinds'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ConfirmCard } from '@/lib/assistant/types'

const refs = z.array(z.string()).max(12)

const input = z.object({
  idea: z.string().nullable().describe('Idea ref from get_boost_ideas, or null'),
  combo: z
    .object({
      name: z.string().max(60),
      picks: z.array(z.object({ label: z.string().max(30), items: refs, count: z.number().int().min(1).max(3).nullable() })).min(2).max(5),
      price: z.number().positive().nullable().describe('null = suggested price'),
    })
    .nullable(),
  upgrade: z.object({ from: z.string(), to: z.string(), header: z.string().max(60) }).nullable(),
  pairing: z.object({ after: refs.min(1), suggest: refs.min(1).max(3) }).nullable(),
})
type Input = z.infer<typeof input>

const TENANT_SELECT =
  'id, order_backend, convex_deployment_url, menu_engineering_enabled, checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items'

const INVALID =
  'Not valid: every dish must be on the menu and available, a combo must cost less than buying separately, an upgrade must cost more than what it replaces, and it must not duplicate a live offer.'

export function describeIdea(idea: BoostIdea, nameOf: (id: string) => string): ConfirmCard['lines'] {
  switch (idea.kind) {
    case 'combo':
      return [
        ...idea.picks.map((pick) => ({ label: pick.label || 'Choice', value: pick.itemIds.map(nameOf).join(' or ') })),
        { label: 'Combo price', value: `${formatPeso(idea.price)} (regular ${formatPeso(idea.regularPrice)})` },
      ]
    case 'upgrade':
      return [
        { label: 'When they pick', value: nameOf(idea.sourceId) },
        { label: 'Offer', value: `${nameOf(idea.targetId)} (+${formatPeso(idea.priceDifference)})` },
      ]
    case 'pairing':
      return [
        { label: 'After adding', value: idea.sourceIds.map(nameOf).join(', ') },
        { label: 'Suggest', value: idea.targetIds.map(nameOf).join(', ') },
      ]
    case 'last_call':
      return [{ label: 'Cart', value: 'Quick add-ons before checkout' }]
  }
}

function resolveIdea(workspace: BoostWorkspace, ideaId: string | null): BoostIdea | null {
  return ideaId ? (workspace.ideas.find((idea) => idea.id === ideaId) ?? null) : null
}

export const proposeOfferTool: AssistantToolDef<Input> = {
  name: 'propose_offer',
  description:
    'Propose ONE combo, upgrade or pairing (set exactly one of idea/combo/upgrade/pairing; dishes as item refs). The user must confirm.',
  access: { permission: 'analytics' },
  input,
  async run(ctx, request) {
    const given = [request.idea, request.combo, request.upgrade, request.pairing].filter((value) => value !== null)
    if (given.length !== 1) return refused('Set exactly one of idea, combo, upgrade or pairing.')

    const { data } = await createAdminClient().from('tenants').select(TENANT_SELECT).eq('id', ctx.tenantId).single()
    if (!data) return refused('Store settings could not be read.')
    const workspace = await getBoostWorkspace(data as unknown as BoostTenantFields)

    let idea: BoostIdea | null
    if (request.idea) {
      idea = resolveIdea(workspace, ctx.refs.resolve(request.idea, 'idea'))
      if (!idea) return refused('That idea is no longer available. Call get_boost_ideas again.')
    } else {
      const refToId = itemRefMap(ctx.refs.snapshot())
      idea = validateOffer(
        {
          combos: request.combo ? [{ name: request.combo.name, price: request.combo.price ?? undefined, picks: request.combo.picks.map((p) => ({ ...p, count: p.count ?? undefined })) }] : [],
          upgrades: request.upgrade ? [request.upgrade] : [],
          pairings: request.pairing ? [request.pairing] : [],
        },
        workspace,
        refToId,
      )
      if (!idea) return refused(INVALID)
    }

    const names = new Map(workspace.items.map((item) => [item.id, item.name]))
    const payload: OfferPayload = { idea, enableBoost: !workspace.isEnabled }
    const askedPrice = request.combo?.price ?? null
    const proposal = await fileProposal(ctx, {
      kind: idea.kind === 'combo' ? 'bundle' : 'upsell',
      payload,
      summary: idea.title,
      title: idea.kind === 'combo' ? `New combo: ${idea.name}` : idea.title,
      lines: describeIdea(idea, (id) => names.get(id) ?? 'a dish'),
      warning: workspace.isEnabled
        ? 'Goes live on your storefront when you confirm.'
        : 'Goes live when you confirm, and switches Boost Sales on.',
    })
    // The validator re-prices a combo that would not save the customer money.
    if (idea.kind === 'combo' && askedPrice !== null && askedPrice !== idea.price) {
      return {
        ...proposal,
        facts: { ...proposal.facts, priceAdjusted: { asked: askedPrice, proposed: idea.price, regular: idea.regularPrice, why: 'A combo must cost less than buying the dishes separately.' } },
      }
    }
    return proposal
  },
}
