/** @jest-environment node */
/**
 * LIVE, READ-ONLY check of replying from the app (`/api/messenger/chat`):
 * loads the real facts for one chat on the platform database (session, store,
 * chat cart, latest order, payment methods) and builds every quick action the
 * chat offers, exactly as the route would before sending. Sends nothing,
 * writes nothing.
 *
 * Opt-in:
 *   STAFF_CHAT_LIVE=1 STAFF_CHAT_LIVE_TENANT=<tenant id> STAFF_CHAT_LIVE_SESSION=<messenger_sessions.id> \
 *     npx jest tests/live/staff-chat-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.STAFF_CHAT_LIVE === '1'

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const liveDescribe = isLive ? describe : describe.skip

liveDescribe('Staff chat quick actions (live platform DB, read-only)', () => {
  jest.setTimeout(60_000)

  it('loads the chat and builds every offered card', async () => {
    const tenantId = process.env.STAFF_CHAT_LIVE_TENANT ?? ''
    const sessionId = process.env.STAFF_CHAT_LIVE_SESSION ?? ''
    const { loadStaffChatFacts, buildStaffCard } = await import('@/lib/messenger/staff-chat-deps')
    const { replyWindow, staffChips } = await import('@/lib/messenger/staff-chat')
    const now = new Date()

    const facts = await loadStaffChatFacts(tenantId, sessionId, now)
    expect(facts).not.toBeNull()
    if (!facts) return
    const report: string[] = [
      `platform=${facts.bundle.isPlatformOrders} page=${Boolean(facts.bundle.facebookPageRowId)} bot=${facts.bundle.settings.botEnabled} takeover=${facts.bundle.settings.takeoverMinutes}`,
      `window=${JSON.stringify(replyWindow(facts.session.lastInboundAt, now))}`,
      `cart=${facts.cart ? `${facts.cart.priced.itemCount} items, ${facts.cart.priced.totalCentavos}c` : 'none'}`,
      `order=${facts.order ? `${facts.order.label} ${facts.order.status} paid=${facts.order.isPaid} chat=${facts.order.isChatOrder} methods=${facts.order.payMethodCount}` : 'none'}`,
    ]

    const chips = staffChips({
      window: replyWindow(facts.session.lastInboundAt, now),
      cartCount: facts.cart?.priced.itemCount ?? 0,
      cartTotalCentavos: facts.cart?.priced.totalCentavos ?? 0,
      hasCategories: (facts.bundle.store?.categories.length ?? 0) > 0,
      order: facts.order,
    })
    for (const chip of chips) {
      const messages = await buildStaffCard(facts, chip.card)
      // Every chip the app offers must have something to send.
      expect(messages.length).toBeGreaterThan(0)
      report.push(`\n[${chip.label}] → ${messages.length} message(s)`)
      for (const message of messages) {
        report.push(`  ${message.kind}: ${message.kind === 'cards'
          ? message.cards.map((card) => card.title).join(' | ')
          : message.text.replace(/\n/g, ' / ').slice(0, 240)}`)
      }
    }
    console.log(report.join('\n'))
  })
})
