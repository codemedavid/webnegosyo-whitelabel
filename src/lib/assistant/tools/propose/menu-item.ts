/**
 * propose_menu_item — a new dish for the owner to confirm. No photo here: the
 * server never fetches a URL the model chose; the success card links to the
 * dish editor to add one.
 */

import { z } from 'zod'
import { menuItemSchema } from '@/lib/admin-service'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { readAssistantCategories, readAssistantMenu } from '@/lib/assistant/data/menu'
import type { MenuItemPayload } from '@/lib/assistant/actions/kinds'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const input = z.object({
  name: z.string().trim().min(2).max(80),
  price: z.number().min(0).max(100_000),
  category: z.string().trim().min(1).describe('Existing category name'),
  description: z.string().trim().max(300).describe('Short, appetising; may be empty'),
})
type Input = z.infer<typeof input>

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export const proposeMenuItemTool: AssistantToolDef<Input> = {
  name: 'propose_menu_item',
  description: 'Propose adding a new dish (name, price, existing category, description). The user must confirm.',
  access: { permission: 'menu' },
  input,
  async run(ctx, request) {
    const [categories, menu] = await Promise.all([
      readAssistantCategories(ctx.tenantId),
      ctx.memo('menu', () => readAssistantMenu(ctx.tenantId)),
    ])
    const category = categories.find((c) => fold(c.name) === fold(request.category))
    if (!category) {
      return refused(`No category named "${request.category}". Existing: ${categories.slice(0, 15).map((c) => c.name).join(', ') || 'none'}.`)
    }
    if (menu.some((item) => fold(item.name) === fold(request.name))) {
      return refused(`"${request.name}" is already on the menu.`)
    }

    const parsed = menuItemSchema.safeParse({
      name: request.name,
      description: request.description,
      price: request.price,
      category_id: category.id,
      image_url: '',
      addons: [],
    })
    if (!parsed.success) return refused(parsed.error.issues[0]?.message ?? 'That dish is not valid.')

    const payload: MenuItemPayload = { input: parsed.data }
    return fileProposal(ctx, {
      kind: 'menu_item',
      payload,
      summary: `Add ${request.name} (${formatPeso(request.price)}) to ${category.name}`,
      title: `New dish: ${request.name}`,
      lines: [
        { label: 'Price', value: formatPeso(request.price) },
        { label: 'Category', value: category.name },
        ...(request.description ? [{ label: 'Description', value: request.description }] : []),
      ],
      warning: 'Appears on your menu when you confirm. Add a photo after.',
    })
  },
}
