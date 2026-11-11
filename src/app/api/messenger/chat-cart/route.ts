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

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIP } from '@/lib/rate-limit'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import { readMessengerLinkToken } from '@/lib/messenger/link-token'
import { readSessionOwner } from '@/lib/messenger/session'
import { readChatCart } from '@/lib/messenger/chat-cart-store'
import { chatOrderableItem } from '@/lib/messenger/chat-cart'
import { buildReplyStore } from '@/lib/messenger/store-view'

export const runtime = 'nodejs'

const bodySchema = z.object({ tenantId: z.string().uuid(), token: z.string().max(200) }).strict()
const LIMIT = { limit: 30, windowSec: 60 }

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)
  if (!ip) return NextResponse.json({ error: 'Unable to verify client IP address' }, { status: 400 })
  const limit = await checkRateLimit(`msgr-chat-cart:${ip}`, LIMIT)
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { tenantId, token } = parsed.data

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
}
