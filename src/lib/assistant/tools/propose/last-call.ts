/**
 * propose_cart_last_call — the cart's "last call" row: switch it on or off,
 * retitle it, and pick the dishes it offers (none = the engine picks).
 * Checkout is never gated by it; it is an inline row in the cart.
 */

import { z } from 'zod'
import { lastCallSaveSchema } from '@/lib/boost/writes'
import { readBoostWorkspace } from '@/lib/assistant/data/boost'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { LastCallPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

/** What the cart row shows at most (lastCallSaveSchema allows 1..8). */
const MAX_SHOWN = 8

const input = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(60).nullable().describe('null = keep current'),
  items: z.array(z.string()).max(12).nullable().describe('Item refs to offer; [] = automatic; null = keep current'),
  maxItems: z.number().int().min(1).max(MAX_SHOWN).nullable().describe('null = keep current'),
})
type Input = z.infer<typeof input>

export const proposeCartLastCallTool: AssistantToolDef<Input> = {
  name: 'propose_cart_last_call',
  description: "Propose the cart's last-call add-on row: on/off, title, which dishes (item refs) and how many. The user must confirm.",
  access: { permission: 'analytics' },
  input,
  async run(ctx, request) {
    const workspace = await readBoostWorkspace(ctx)
    if (!workspace) return refused('Store settings could not be read.')

    let pickedItemIds = workspace.lastCall.pickedItemIds
    if (request.items !== null) {
      const ids = request.items.map((ref) => ctx.refs.resolve(ref, 'item'))
      if (ids.some((id) => !id)) return refused('Unknown item ref. Use search_menu first.')
      const available = new Set(workspace.items.filter((item) => item.isAvailable).map((item) => item.id))
      if ((ids as string[]).some((id) => !available.has(id))) return refused('Every dish must be on the menu and available.')
      pickedItemIds = [...new Set(ids as string[])]
    }

    const parsed = lastCallSaveSchema.safeParse({
      enabled: request.enabled,
      title: request.title ?? workspace.lastCall.title,
      subtitle: workspace.lastCall.subtitle,
      maxItems: request.maxItems ?? workspace.lastCall.maxItems,
      pickedItemIds,
    })
    if (!parsed.success) return refused(parsed.error.issues[0]?.message ?? 'That last call is not valid.')

    const nameOf = new Map(workspace.items.map((item) => [item.id, item.name]))
    const enableBoost = request.enabled && !workspace.isEnabled
    const payload: LastCallPayload = { input: parsed.data, enableBoost }
    const dishes = parsed.data.pickedItemIds.length > 0 ? parsed.data.pickedItemIds.map((id) => nameOf.get(id) ?? 'a dish').join(', ') : 'Picked automatically from your best add-ons'
    return fileProposal(ctx, {
      kind: 'last_call',
      payload,
      summary: `Cart last call ${request.enabled ? 'on' : 'off'}`,
      title: request.enabled ? 'Cart last call' : 'Turn off cart last call',
      lines: request.enabled
        ? [
            { label: 'Title', value: parsed.data.title },
            { label: 'Dishes', value: dishes },
            { label: 'Shows up to', value: `${parsed.data.maxItems} dishes` },
          ]
        : [{ label: 'Change', value: 'The cart stops showing quick add-ons' }],
      warning: enableBoost ? 'Goes live when you confirm, and switches Boost Sales on.' : 'Changes your cart when you confirm.',
    })
  },
}
