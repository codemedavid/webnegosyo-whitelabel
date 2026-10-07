/**
 * propose_menu_item_change — a dish's price, or marking it sold out / back in
 * stock. Sold out keeps the dish listed but unorderable (`is_available`),
 * which is how the menu already treats "out of stock".
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { MenuItemChangePayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ConfirmCard } from '@/lib/assistant/types'

/** A price move this large is far more likely a typo than a decision. */
const MAX_PRICE_CHANGE_RATIO = 3
const MAX_PRICE = 100_000

const input = z.object({
  item: z.string().describe('Item ref from search_menu'),
  price: z.number().positive().max(MAX_PRICE).nullable().describe('New price; null = keep'),
  available: z.boolean().nullable().describe('false = sold out; null = keep'),
})
type Input = z.infer<typeof input>

interface ItemRow {
  id: string
  name: string
  price: number | string
  discounted_price: number | string | null
  is_available: boolean | null
}

export const proposeMenuItemChangeTool: AssistantToolDef<Input> = {
  name: 'propose_menu_item_change',
  description: "Propose changing a dish's price and/or marking it sold out / available. The user must confirm.",
  access: { permission: 'menu' },
  input,
  async run(ctx, request) {
    if (request.price === null && request.available === null) return refused('Say what to change: a price, availability, or both.')
    const itemId = ctx.refs.resolve(request.item, 'item')
    if (!itemId) return refused('Unknown item ref. Use search_menu first.')

    const { data, error } = await createAdminClient()
      .from('menu_items')
      .select('id, name, price, discounted_price, is_available')
      .eq('id', itemId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (error) return refused('The dish could not be read.')
    const item = data as ItemRow | null
    if (!item) return refused('That dish is no longer on the menu.')

    const current = Number(item.price) || 0
    const isAvailable = item.is_available !== false
    const lines: ConfirmCard['lines'] = [{ label: 'Dish', value: item.name }]
    let price: number | null = null
    if (request.price !== null) {
      price = Math.round(request.price * 100) / 100
      if (price === current) return refused(`${item.name} is already ${formatPeso(current)}.`)
      if (current > 0 && (price > current * MAX_PRICE_CHANGE_RATIO || price < current / MAX_PRICE_CHANGE_RATIO)) {
        return refused(`That is more than ${MAX_PRICE_CHANGE_RATIO}x away from the current ${formatPeso(current)}. Confirm the exact price with the user.`)
      }
      const sale = item.discounted_price === null ? null : Number(item.discounted_price)
      if (sale !== null && sale >= price) return refused(`${item.name} has a sale price of ${formatPeso(sale)}; the new price must be above it.`)
      lines.push({ label: 'Price', value: `${formatPeso(current)} → ${formatPeso(price)}` })
    }
    let available: boolean | null = null
    if (request.available !== null && request.available !== isAvailable) {
      available = request.available
      lines.push({ label: 'Status', value: available ? 'Back in stock (orderable)' : 'Sold out (listed, not orderable)' })
    }
    if (price === null && available === null) return refused(`${item.name} is already ${isAvailable ? 'available' : 'sold out'}.`)

    const payload: MenuItemChangePayload = { itemId: item.id, name: item.name, price, isAvailable: available, expectedPrice: current }
    const parts = [price !== null ? `price to ${formatPeso(price)}` : null, available === null ? null : available ? 'back in stock' : 'sold out'].filter(Boolean)
    return fileProposal(ctx, {
      kind: 'menu_item_change',
      payload,
      summary: `${item.name}: ${parts.join(', ')}`,
      title: `Update ${item.name}`,
      lines,
      warning: 'Changes your live menu when you confirm.',
    })
  },
}
