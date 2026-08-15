import { planWebhookRegistrations, buildLoyverseWebhookUrl } from '@/lib/loyverse/webhooks'

const APP_URL = 'https://www.webnegosyo.com'
const TENANT = 'tenant-1'
const SECRET = 's3cret'

describe('buildLoyverseWebhookUrl', () => {
  it('targets the webhook route with tenant and secret in the query', () => {
    const url = buildLoyverseWebhookUrl(APP_URL, TENANT, SECRET)
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/api/loyverse/webhook')
    expect(parsed.searchParams.get('tenant_id')).toBe(TENANT)
    expect(parsed.searchParams.get('secret')).toBe(SECRET)
  })
})

describe('planWebhookRegistrations', () => {
  const url = buildLoyverseWebhookUrl(APP_URL, TENANT, SECRET)

  it('registers both events when none exist', () => {
    const plan = planWebhookRegistrations([], url)
    expect(plan.map((p) => p.type).sort()).toEqual(['inventory_levels.update', 'items.update'])
    expect(plan.every((p) => p.url === url)).toBe(true)
  })

  it('is idempotent — an already-registered (type, url) pair is not re-created', () => {
    const existing = [
      { id: 'wh1', type: 'items.update', url, status: 'ENABLED' },
    ]
    const plan = planWebhookRegistrations(existing, url)
    expect(plan.map((p) => p.type)).toEqual(['inventory_levels.update'])
  })

  it('re-registers a webhook Loyverse disabled after 48h of failures', () => {
    const existing = [
      { id: 'wh1', type: 'items.update', url, status: 'DISABLED' },
      { id: 'wh2', type: 'inventory_levels.update', url, status: 'ENABLED' },
    ]
    const plan = planWebhookRegistrations(existing, url)
    expect(plan).toEqual([{ type: 'items.update', url, existingId: 'wh1' }])
  })

  it('ignores webhooks pointing at other URLs (another integration, another env)', () => {
    const existing = [
      { id: 'wh1', type: 'items.update', url: 'https://other.example/hook', status: 'ENABLED' },
    ]
    const plan = planWebhookRegistrations(existing, url)
    expect(plan.map((p) => p.type).sort()).toEqual(['inventory_levels.update', 'items.update'])
  })
})
