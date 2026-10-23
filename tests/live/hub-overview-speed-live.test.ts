/** @jest-environment node */
/**
 * LIVE timing of the Reports tab's server read (`POST /api/customers/hub-overview`)
 * on a real, busy store. The merchant app gives up after 15 s
 * (`OVERVIEW_TIMEOUT_MS`), so the read must finish well inside that.
 *
 * Read-only (service role, like the route after its access checks).
 *
 * Opt-in:
 *   HUB_SPEED_LIVE=1 HUB_SPEED_TENANT=<uuid> [HUB_SPEED_BUDGET_MS=8000] \
 *     npx jest tests/live/hub-overview-speed-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.HUB_SPEED_LIVE === '1'

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const liveDescribe = isLive ? describe : describe.skip
const BUDGET_MS = Number(process.env.HUB_SPEED_BUDGET_MS ?? 8000)

liveDescribe('hub overview read on a real store', () => {
  jest.setTimeout(120_000)

  it('reads every order and line inside the app budget', async () => {
    const tenantId = process.env.HUB_SPEED_TENANT
    if (!tenantId) throw new Error('HUB_SPEED_TENANT is required')
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { fetchCustomerOrderFacts } = await import('@/lib/queries/customer-facts')
    const { loadCustomerHubOverview } = await import('@/lib/customers/load-hub-overview')
    const admin = createAdminClient()

    const { count: orderCount } = await admin
      .from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)

    const factsStart = Date.now()
    const read = await fetchCustomerOrderFacts(
      { id: tenantId, order_backend: 'platform' } as never,
      { days: 90, includeLifetime: true, platformClient: admin as never },
    )
    const factsMs = Date.now() - factsStart

    const loadStart = Date.now()
    const load = await loadCustomerHubOverview(tenantId, { windowDays: 90, outletId: null })
    const loadMs = Date.now() - loadStart

    const ids = new Set(read.facts.map((fact) => fact.externalOrderId))
    const items = read.facts.reduce((sum, fact) => sum + fact.items.length, 0)
    process.stdout.write(
      `orders=${orderCount} facts=${read.facts.length} unique=${ids.size} items=${items} ` +
      `factsMs=${factsMs} loadMs=${loadMs} coverage=${JSON.stringify(read.coverage)}\n`,
    )

    expect(load.ok).toBe(true)
    expect(read.coverage.complete).toBe(true)
    // Orders placed during the read may land after the count; none may be lost or doubled.
    expect(ids.size).toBe(read.facts.length)
    expect(read.facts.length).toBeGreaterThanOrEqual(orderCount ?? 0)
    expect(loadMs).toBeLessThan(BUDGET_MS)
  })
})
