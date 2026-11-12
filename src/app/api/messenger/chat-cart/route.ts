/**
 * POST /api/messenger/chat-cart — the dishes a customer added in Messenger,
 * for the web cart to load (`MessengerCartImport` on the cart page, opened by
 * the chat's Checkout button).
 *
 * The signed `?m=` link token names a `messenger_sessions` row and only a
 * token for THIS store resolves. The answer is menu data the storefront shows
 * anyway (current price, only dishes orderable from the chat) plus quantities;
 * checkout re-prices everything again.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import { readMessengerLinkToken } from '@/lib/messenger/link-token'
import { readSessionOwner } from '@/lib/messenger/session'
import { readChatCart } from '@/lib/messenger/chat-cart-store'
import { chatOrderableItem } from '@/lib/messenger/chat-cart'
import { buildReplyStore } from '@/lib/messenger/store-view'
import { defineRoute } from '@/platform/http/define-route'

export const runtime = 'nodejs'

const bodySchema = z.object({ tenantId: z.string().uuid(), token: z.string().max(200) }).strict()

export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'msgr-chat-cart', per: 'ip', max: 30, window: '1m' },
  body: bodySchema,
  onRefusal: (refusal) => (refusal.code === 'invalid' ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : undefined),
  handler: async ({ body }) => {
    const { tenantId, token } = body

    const sessionId = readMessengerLinkToken(token)
    const owner = sessionId ? await readSessionOwner(sessionId) : null
    if (!sessionId || !owner || owner.tenantId !== tenantId) {
      return NextResponse.json({ error: 'This Messenger link has expired' }, { status: 403 })
    }

    const { data: tenant } = await createAdminClient().from('tenants').select('slug').eq('id', tenantId).eq('is_active', true).maybeSingle()
    const slug = (tenant as { slug: string } | null)?.slug
    if (!slug) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const [cart, menu] = await Promise.all([readChatCart(sessionId), getStorefrontMenu(slug).catch(() => null)])
    if (!cart || !menu || menu.status !== 'ready' || !menu.tenant) {
      return NextResponse.json({ error: "Couldn't read your Messenger cart right now" }, { status: 503 })
    }

    const store = buildReplyStore({
      tenant: menu.tenant,
      categories: menu.categories,
      menuItems: menu.menuItems,
      rootDomain: process.env.PLATFORM_ROOT_DOMAIN ?? null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      now: new Date(),
    })
    const byId = new Map(menu.menuItems.map((item) => [item.id, item]))
    const items = store
      ? cart.flatMap((line) => {
          const menuItem = chatOrderableItem(store, line.itemId) ? byId.get(line.itemId) : undefined
          return menuItem && menuItem.tenant_id === tenantId ? [{ menuItem, quantity: line.qty }] : []
        })
      : []

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
  },
})
