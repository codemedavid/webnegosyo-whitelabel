/** @jest-environment node */
/**
 * LIVE SEND of replying from the app: a typed reply and the menu card go to
 * ONE real Messenger chat, through the same handler and side effects as
 * `POST /api/messenger/chat` (send, chat log with `sent_by`, bot pause,
 * "Needs a reply" cleared), then the bot is switched back on. Only the access
 * check is replaced (the route's bearer + RLS check has its own tests): the
 * chat must belong to the store, read with the service role.
 *
 * It MESSAGES A REAL PERSON. Use it only on a chat whose owner said yes.
 *
 *   STAFF_CHAT_SEND_LIVE=1 STAFF_CHAT_LIVE_TENANT=<tenant id> STAFF_CHAT_LIVE_SESSION=<messenger_sessions.id> \
 *     STAFF_CHAT_LIVE_USER=<staff user id> npx jest tests/live/staff-chat-send-live.test.ts
 */
import fs from 'fs'
import path from 'path'
import type { StaffChatDeps } from '@/lib/messenger/staff-chat-handler'

const isLive = process.env.STAFF_CHAT_SEND_LIVE === '1'

if (isLive) {
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

// Outside Next there is no data cache: read the menu straight through.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
}))

const liveDescribe = isLive ? describe : describe.skip

liveDescribe('Staff chat send (live: messages one real chat)', () => {
  jest.setTimeout(90_000)

  it('sends a typed reply and the menu card, logs both under the staff account, then resumes the bot', async () => {
    const tenantId = process.env.STAFF_CHAT_LIVE_TENANT ?? ''
    const sessionId = process.env.STAFF_CHAT_LIVE_SESSION ?? ''
    const userId = process.env.STAFF_CHAT_LIVE_USER ?? ''
    expect(tenantId && sessionId && userId).toBeTruthy()

    const { handleStaffChat } = await import('@/lib/messenger/staff-chat-handler')
    const deps = await import('@/lib/messenger/staff-chat-deps')
    const { clearNeedsReply } = await import('@/lib/messenger/staff-alert-deps')
    const { messengerDb } = await import('@/lib/messenger/service-db')
    const db = messengerDb()
    const startedAt = new Date()

    const realDeps: StaffChatDeps = {
      now: () => new Date(),
      canReadChat: async (tenant: string, session: string) => {
        const { data } = await db.from('messenger_sessions').select('id').eq('id', session).eq('tenant_id', tenant).maybeSingle()
        return Boolean(data)
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
    }
    const caller = { userId }
    const tap = `live-${startedAt.getTime()}`

    const reply = await handleStaffChat(
      { action: 'send_text', tenantId, sessionId, clientId: `${tap}-t`, text: 'Test from the app ✅ (SmartMenu staff reply check)' },
      caller, realDeps,
    )
    console.log('[send_text]', JSON.stringify(reply))
    expect(reply).toMatchObject({ status: 200, body: { status: 'sent' } })

    const card = await handleStaffChat({ action: 'send_card', tenantId, sessionId, clientId: `${tap}-m`, card: 'menu' }, caller, realDeps)
    console.log('[send_card menu]', JSON.stringify(card))
    expect(card).toMatchObject({ status: 200, body: { status: 'sent' } })

    // The same tap again goes out once — only where Redis holds the claim. Without
    // UPSTASH_REDIS_URL the claim fails open by design, so the repeat is not sent here
    // (a 2026-11-15 run without Redis delivered the card twice).
    if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
      const again = await handleStaffChat({ action: 'send_card', tenantId, sessionId, clientId: `${tap}-m`, card: 'menu' }, caller, realDeps)
      expect(again.body).toEqual({ status: 'already_sent' })
    } else {
      console.warn('[dedupe] no Redis configured: the once-only claim is NOT checked by this run')
    }

    const { data: lines } = await db
      .from('messenger_messages')
      .select('direction, body, sent_by, mid')
      .eq('session_id', sessionId)
      .gte('sent_at', startedAt.toISOString())
      .order('sent_at', { ascending: true })
    console.log('[log lines]', JSON.stringify(lines))
    expect((lines ?? []).filter((line) => line.sent_by === userId).map((line) => line.direction)).toEqual(['staff', 'bot'])

    const { data: paused } = await db.from('messenger_sessions').select('bot_paused_until, needs_reply_since').eq('id', sessionId).single()
    console.log('[after reply]', JSON.stringify(paused))
    expect(paused?.bot_paused_until).not.toBeNull()
    expect(paused?.needs_reply_since).toBeNull()

    // Leave the chat as it was: the bot answers again.
    const resume = await handleStaffChat({ action: 'bot', tenantId, sessionId, pause: false }, caller, realDeps)
    expect(resume.body).toEqual({ pausedUntil: null })
    const { data: after } = await db.from('messenger_sessions').select('bot_paused_until').eq('id', sessionId).single()
    expect(after?.bot_paused_until).toBeNull()
  })
})
