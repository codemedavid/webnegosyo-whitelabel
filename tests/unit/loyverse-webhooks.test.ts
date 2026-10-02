import { planWebhookRegistrations, buildLoyverseWebhookUrl } from '@/lib/loyverse/webhooks'
import { isValidLoyverseWebhookSignature } from '@/lib/loyverse/secret-compare'

const APP_URL = 'https://www.webnegosyo.com'
const TENANT = 'tenant-1'
const SECRET = 's3cret'

describe('buildLoyverseWebhookUrl', () => {
  it('targets the webhook route with the tenant and a per-tenant signature', () => {
    const parsed = new URL(buildLoyverseWebhookUrl(APP_URL, TENANT, SECRET))
    expect(parsed.pathname).toBe('/api/loyverse/webhook')
    expect(parsed.searchParams.get('tenant_id')).toBe(TENANT)
    expect(isValidLoyverseWebhookSignature(SECRET, TENANT, parsed.searchParams.get('sig'))).toBe(true)
  })

  it('never embeds the platform secret — every merchant can read their own webhook URL', () => {
    const url = buildLoyverseWebhookUrl(APP_URL, TENANT, SECRET)
    expect(url).not.toContain(SECRET)
    expect(new URL(url).searchParams.has('secret')).toBe(false)
  })

  it("signs each tenant differently, so one merchant's URL cannot address another tenant", () => {
    const sigA = new URL(buildLoyverseWebhookUrl(APP_URL, 'tenant-a', SECRET)).searchParams.get('sig')
    expect(isValidLoyverseWebhookSignature(SECRET, 'tenant-b', sigA)).toBe(false)
  })
})

describe('planWebhookRegistrations', () => {
  const url = buildLoyverseWebhookUrl(APP_URL, TENANT, SECRET)

  it('registers both events when none exist', () => {
    const plan = planWebhookRegistrations([], url)
    expect(plan.register.map((p) => p.type).sort()).toEqual(['inventory_levels.update', 'items.update'])
    expect(plan.register.every((p) => p.url === url)).toBe(true)
    expect(plan.remove).toEqual([])
  })

  it('is idempotent — an already-registered (type, url) pair is not re-created', () => {
    const existing = [{ id: 'wh1', type: 'items.update', url, status: 'ENABLED' }]
    const plan = planWebhookRegistrations(existing, url)
    expect(plan.register.map((p) => p.type)).toEqual(['inventory_levels.update'])
  })

  it('re-registers a webhook Loyverse disabled after 48h of failures', () => {
    const existing = [
      { id: 'wh1', type: 'items.update', url, status: 'DISABLED' },
      { id: 'wh2', type: 'inventory_levels.update', url, status: 'ENABLED' },
    ]
    const plan = planWebhookRegistrations(existing, url)
    expect(plan.register).toEqual([{ type: 'items.update', url, existingId: 'wh1' }])
  })

  it('removes our endpoint registered under a superseded URL (the legacy ?secret= shape)', () => {
    const legacy = `${APP_URL}/api/loyverse/webhook?tenant_id=${TENANT}&secret=${SECRET}`
    const existing = [
      { id: 'old1', type: 'items.update', url: legacy, status: 'ENABLED' },
      { id: 'old2', type: 'inventory_levels.update', url: legacy, status: 'ENABLED' },
    ]
    const plan = planWebhookRegistrations(existing, url)
    expect(plan.register).toHaveLength(2)
    expect(plan.remove.sort()).toEqual(['old1', 'old2'])
  })

  it('ignores webhooks pointing at other origins (another integration, another env)', () => {
    const existing = [
      { id: 'wh1', type: 'items.update', url: 'https://other.example/hook', status: 'ENABLED' },
      { id: 'wh2', type: 'items.update', url: 'https://staging.example/api/loyverse/webhook?x=1', status: 'ENABLED' },
    ]
    const plan = planWebhookRegistrations(existing, url)
    expect(plan.register.map((p) => p.type).sort()).toEqual(['inventory_levels.update', 'items.update'])
    expect(plan.remove).toEqual([])
  })
})
