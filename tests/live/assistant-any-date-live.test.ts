/** @jest-environment node */
/**
 * LIVE: Owl's any-date tools against the real platform database, as a REAL
 * signed-in user (no model, no stubbed session).
 *
 * The designated test store's admin gets a session the way the
 * verify-webnegosyo harness does (service-role magic link, no email, no
 * password change); every tool then runs inside `withRequestBearer`, so
 * `createClient()` is that user's own client and RLS + the activity RPC's
 * auth.uid() checks apply exactly as in the merchant app. Read-only: nothing
 * is written.
 *
 *   ASSISTANT_ANYDATE_LIVE=1 npx jest tests/live/assistant-any-date-live.test.ts
 *   (optional: ASSISTANT_ANYDATE_TENANT, ASSISTANT_ANYDATE_EMAIL; default = sample-demo)
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.ASSISTANT_ANYDATE_LIVE === '1'
const TENANT = process.env.ASSISTANT_ANYDATE_TENANT ?? '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const EMAIL = process.env.ASSISTANT_ANYDATE_EMAIL ?? 'admin@sampledemowebnegosyo.com'

if (isLive) {
  // Jest loads .env.test (fake hosts); a live run must use the real ones.
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidatePath: jest.fn(), revalidateTag: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }))

const maybe = isLive ? describe : describe.skip

maybe('Owl any-date tools, live, as the real user', () => {
  jest.setTimeout(60_000)
  let token = ''
  let userId = ''

  beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
    if (error || !link.properties?.hashed_token) throw new Error(`generateLink: ${error?.message}`)
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, { auth: { persistSession: false } })
    const { data: session, error: verifyError } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
    if (verifyError || !session.session) throw new Error(`verifyOtp: ${verifyError?.message}`)
    token = session.session.access_token
    userId = session.user?.id ?? ''
  })

  async function run(toolName: string, args: Record<string, unknown>) {
    const { ASSISTANT_TOOLS } = await import('@/lib/assistant/tools')
    const { createTurnMemo, factsForModel } = await import('@/lib/assistant/tools/registry')
    const { createRefBook } = await import('@/lib/assistant/refs')
    const { withRequestBearer } = await import('@/lib/supabase/bearer-session')
    const tool = ASSISTANT_TOOLS.find((candidate) => candidate.name === toolName)
    if (!tool) throw new Error(`no tool ${toolName}`)
    const ctx = {
      tenantId: TENANT,
      tenantSlug: 'live',
      conversationId: 'live',
      caller: { userId, role: 'admin', is_owner: true, permissions: null },
      flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true, isPlatformOrders: true },
      refs: createRefBook({}),
      photos: [],
      memo: createTurnMemo(),
    }
    const request = new Request('http://live.local', { headers: { authorization: `Bearer ${token}` } })
    const result = await withRequestBearer(request, () => tool.run(ctx as never, tool.input.parse(args)))
    const facts = factsForModel(result)
    console.log(`\n=== ${toolName} ${JSON.stringify(args)}\n${JSON.stringify(facts, null, 1).slice(0, 2500)}`)
    return { result, facts }
  }

  test('get_sales_overview: yesterday, a date, hours of a day', async () => {
    const yesterday = await run('get_sales_overview', { period: 'yesterday' })
    expect(yesterday.facts.available).not.toBe(false)
    expect(yesterday.facts.period).toBe('Yesterday')
    await run('get_sales_overview', { from: '2026-11-09' })
    await run('get_sales_overview', { period: 'yesterday', fromTime: '09:00', toTime: '15:00' })
  })

  test('get_activity_log: yesterday, then one category', async () => {
    const log = await run('get_activity_log', { period: 'last_7_days' })
    expect(log.facts.available).not.toBe(false)
    expect(Array.isArray(log.facts.entries)).toBe(true)
    await run('get_activity_log', { period: 'last_7_days', category: 'orders' })
  })

  test('get_staff_activity: yesterday', async () => {
    const staff = await run('get_staff_activity', { period: 'yesterday' })
    expect(staff.facts.available).not.toBe(false)
  })

  test('get_shifts: one day first, then the week', async () => {
    const day = await run('get_shifts', { period: 'yesterday' })
    expect(day.facts.available).toBe(true)
    expect(typeof day.facts.shifts).toBe('number')
    const week = await run('get_shifts', { period: 'last_7_days' })
    expect(week.facts.available).toBe(true)
    expect(JSON.stringify(week.facts)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  test('get_profit: one day first, then this month; the statement adds up', async () => {
    const day = await run('get_profit', { period: 'yesterday' })
    expect(day.facts.available).toBe(true)
    const month = await run('get_profit', { period: 'this_month' })
    expect(month.facts.available).toBe(true)
    const amount = (key: string) => (month.facts[key] as { amount: number | null } | null)?.amount ?? 0
    // Sales − ingredients − expenses = profit, to the centavo.
    expect(Math.round((amount('sales') - amount('costOfIngredients') - amount('expenses')) * 100)).toBe(Math.round(amount('profit') * 100))
    expect(month.result.card?.type).toBe('stats')
  })

  test('get_order: the newest order number of the last 7 days', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })
    const { data } = await admin.from('orders').select('daily_number, order_date').eq('tenant_id', TENANT).not('daily_number', 'is', null).order('created_at', { ascending: false }).limit(1)
    const newest = data?.[0]
    expect(newest).toBeTruthy()
    const order = await run('get_order', { number: String(newest!.daily_number), date: newest!.order_date })
    expect(order.facts.available).not.toBe(false)
    expect(order.facts.order).toBe(`#${String(newest!.daily_number).padStart(2, '0')}`)
  })
})
