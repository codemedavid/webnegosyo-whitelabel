/**
 * get_boost_ideas — ready-to-go combos, upgrades, pairings and the cart's last
 * call, built by the Boost Sales engine from real baskets. Ideas carry refs so
 * a later turn can propose one for the owner to confirm.
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBoostWorkspace, type BoostTenantFields, type BoostWorkspace } from '@/lib/boost/workspace'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const IDEA_LIMIT = 6
const KIND_LABEL = { combo: 'Combo', upgrade: 'Upgrade', pairing: 'Pairing', last_call: 'Cart last call' } as const

const input = z.object({})
type Input = z.infer<typeof input>

const TENANT_SELECT =
  'id, order_backend, convex_deployment_url, menu_engineering_enabled, checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items'

export function buildBoostIdeasResult(workspace: BoostWorkspace, refs: RefBook): ToolResult {
  const nameOf = new Map(workspace.items.map((item) => [item.id, item.name]))
  const ideas = workspace.ideas.slice(0, IDEA_LIMIT)
  return {
    facts: {
      boostSalesOn: workspace.isEnabled,
      live: { combos: workspace.combos.length, upgrades: workspace.upgrades.length, pairings: workspace.pairings.length, lastCallOn: workspace.lastCall.enabled },
      learnedFromOrders: workspace.historyOrders,
      ideas: ideas.map((idea) => ({
        ref: refs.refFor('idea', idea.id),
        kind: idea.kind,
        title: idea.title,
        reason: idea.reason,
        dishes: idea.itemIds.slice(0, 4).map((id) => nameOf.get(id)).filter(Boolean),
        ...(idea.kind === 'combo' ? { price: idea.price, regularPrice: idea.regularPrice } : {}),
      })),
    },
    card: {
      type: 'ranked',
      title: 'Ready-to-go offers',
      subtitle: workspace.isEnabled ? 'From your Boost Sales engine' : 'Boost Sales is off — these would switch it on',
      rows: ideas.map((idea) => ({
        label: idea.title,
        value: idea.kind === 'combo' ? formatPeso(idea.price) : '',
        detail: idea.reason,
        badge: KIND_LABEL[idea.kind],
      })),
      emptyText: 'No new ideas right now — your offers already cover the strongest patterns.',
    },
    links: [{ label: 'Open Boost Sales', path: '/boost-sales' }],
  }
}

export const getBoostIdeasTool: AssistantToolDef<Input> = {
  name: 'get_boost_ideas',
  description: 'Suggested combos/upgrades/pairings/last-call from real baskets, plus what is live.',
  access: { permission: 'analytics' },
  input,
  async run(ctx) {
    const { data, error } = await createAdminClient().from('tenants').select(TENANT_SELECT).eq('id', ctx.tenantId).single()
    if (error || !data) return { facts: { available: false, reason: 'Store settings could not be read.' } }
    const workspace = await getBoostWorkspace(data as unknown as BoostTenantFields)
    return buildBoostIdeasResult(workspace, ctx.refs)
  },
}
