import { NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { staffChatBodySchema } from '@/lib/messenger/staff-chat'
import { defineRoute } from '@/platform/http/define-route'

export const runtime = 'nodejs'

/** Per chat, sends only: a stuck button or a leaked token can't flood one customer. */
const CHAT_SEND_LIMIT: RateLimitOptions = { limit: 12, windowSec: 60, onRedisFailure: 'instance' }

/**
 * POST /api/messenger/chat — staff chatting with a customer from the merchant
 * app (bearer). Actions: `tools` (what can be sent now), `preview` (a quick
 * action's messages), `send_card`, `send_text`, `bot` (pause / resume).
 *
 * Who: the same people as Make order — a store-wide account with `pos` that
 * can read this chat (checked as the caller, RLS). Branch-locked accounts are
 * refused for now. Logic and refusals: `staff-chat-handler.ts`.
 */
export const POST = defineRoute({
  auth: {
    kind: 'staff',
    session: 'bearer',
    permission: 'pos',
    branch: 'store-wide',
    access: 'edit',
    storeClaim: ({ body }) => body.tenantId,
  },
  // Every action, per person (the app refreshes tools every few seconds while a chat is open).
  rateLimit: { bucket: 'messenger-chat', per: 'user', max: 60, window: '1m', onRedisFailure: 'instance' },
  body: staffChatBodySchema,
  handler: async ({ tenant, user, body, callerClient }) => {
    if (body.action === 'send_text' || body.action === 'send_card') {
      const chat = await checkRateLimit(`messenger-chat-send:${tenant}:${body.sessionId}`, CHAT_SEND_LIMIT)
      if (!chat.allowed) {
        return NextResponse.json(
          { error: 'Too many messages at once. Wait a moment and try again.', reason: 'busy' },
          { status: 429, headers: { 'Retry-After': String(chat.retryAfterSec) } },
        )
      }
    }

    const [{ handleStaffChat }, deps, { clearNeedsReply }, supabase] = await Promise.all([
      import('@/lib/messenger/staff-chat-handler'),
      import('@/lib/messenger/staff-chat-deps'),
      import('@/lib/messenger/staff-alert-deps'),
      callerClient(),
    ])
    const result = await handleStaffChat({ ...body, tenantId: tenant }, { userId: user.id }, {
      now: () => new Date(),
      canReadChat: async (tenantId, sessionId) => {
        const { data, error } = await supabase
          .from('messenger_sessions')
          .select('id')
          .eq('id', sessionId)
          .eq('tenant_id', tenantId)
          .maybeSingle()
        return !error && Boolean(data)
      },
      loadFacts: deps.loadStaffChatFacts,
      buildCard: deps.buildStaffCard,
      pageToken: (facts) => deps.findPageToken(facts.bundle),
      claimSend: deps.claimClientSend,
      releaseSend: deps.releaseClientSend,
      send: deps.sendAsStore,
      setBotPause: deps.setBotPause,
      writeLog: deps.writeChatLog,
      clearNeedsReply,
      reopenChatOrder: deps.reopenChatOrder,
    })
    return NextResponse.json(result.body, { status: result.status })
  },
})
