import {
  buildWebhookStatusUpdate,
  runLoyverseSync,
  type LoyverseSyncDeps,
} from '@/lib/loyverse/sync-orchestrator'
import type { LoyverseSyncReport } from '@/lib/loyverse/catalog-import'
import type { Tenant } from '@/types/database'

const NOW = '2026-08-27T10:00:00.000Z'

const tenant = {
  id: 'tenant-1',
  slug: 'demo',
  loyverse_enabled: true,
  loyverse_access_token: 'tok',
  loyverse_store_id: 'store-1',
} as unknown as Tenant

const okReport = (): LoyverseSyncReport => ({
  success: true,
  categoriesCreated: 0,
  itemsCreated: 1,
  itemsUpdated: 2,
  itemsSkipped: 0,
  warnings: [],
})

function makeDeps(overrides: Partial<LoyverseSyncDeps> = {}): {
  deps: LoyverseSyncDeps
  calls: string[]
  statusUpdates: Array<Record<string, string | null>>
} {
  const calls: string[] = []
  const statusUpdates: Array<Record<string, string | null>> = []
  const deps: LoyverseSyncDeps = {
    importCatalog: async () => {
      calls.push('import')
      return okReport()
    },
    ensureWebhooks: async () => {
      calls.push('webhooks')
      return { registered: 2, alreadyActive: 0 }
    },
    recordWebhookStatus: async (_tenantId, update) => {
      calls.push('record')
      statusUpdates.push(update)
    },
    nowIso: () => NOW,
    ...overrides,
  }
  return { deps, calls, statusUpdates }
}

describe('buildWebhookStatusUpdate', () => {
  it('stamps registered_at and clears the error on success', () => {
    expect(buildWebhookStatusUpdate({ registered: 1, alreadyActive: 1 }, NOW)).toEqual({
      loyverse_webhooks_registered_at: NOW,
      loyverse_webhook_error: null,
    })
  })

  it('records only the error on failure — a past registration stamp is not erased', () => {
    const update = buildWebhookStatusUpdate(
      { registered: 0, alreadyActive: 0, error: 'LOYVERSE_WEBHOOK_SECRET is not set' },
      NOW
    )
    expect(update).toEqual({ loyverse_webhook_error: 'LOYVERSE_WEBHOOK_SECRET is not set' })
    expect(update).not.toHaveProperty('loyverse_webhooks_registered_at')
  })
})

describe('runLoyverseSync', () => {
  it('registers webhooks BEFORE importing, so a slow import cannot kill registration', async () => {
    const { deps, calls } = makeDeps()
    await runLoyverseSync(tenant, undefined, deps)
    expect(calls.indexOf('webhooks')).toBeGreaterThanOrEqual(0)
    expect(calls.indexOf('webhooks')).toBeLessThan(calls.indexOf('import'))
  })

  it('still imports and returns the report when webhook registration fails, surfacing a warning', async () => {
    const { deps, calls, statusUpdates } = makeDeps({
      ensureWebhooks: async () => ({ registered: 0, alreadyActive: 0, error: 'no https url' }),
    })
    const report = await runLoyverseSync(tenant, undefined, deps)
    expect(calls).toContain('import')
    expect(report.success).toBe(true)
    expect(report.webhooks?.error).toBe('no https url')
    expect(report.warnings.some((w) => w.includes('no https url'))).toBe(true)
    expect(statusUpdates).toEqual([{ loyverse_webhook_error: 'no https url' }])
  })

  it('persists a successful registration stamp', async () => {
    const { deps, statusUpdates } = makeDeps()
    const report = await runLoyverseSync(tenant, undefined, deps)
    expect(report.webhooks).toEqual({ registered: 2, alreadyActive: 0 })
    expect(statusUpdates).toEqual([
      { loyverse_webhooks_registered_at: NOW, loyverse_webhook_error: null },
    ])
  })

  it('skips registration when the tenant has no access token, and still imports', async () => {
    const { deps, calls } = makeDeps()
    const noToken = { ...tenant, loyverse_access_token: null } as unknown as Tenant
    const report = await runLoyverseSync(noToken, undefined, deps)
    expect(calls).toEqual(['import'])
    expect(report.webhooks).toBeUndefined()
  })

  it('passes the app-url override through to registration', async () => {
    let seenAppUrl: string | undefined
    const { deps } = makeDeps({
      ensureWebhooks: async (_token, _tenantId, appUrl) => {
        seenAppUrl = appUrl
        return { registered: 0, alreadyActive: 2 }
      },
    })
    await runLoyverseSync(tenant, 'https://www.webnegosyo.com', deps)
    expect(seenAppUrl).toBe('https://www.webnegosyo.com')
  })
})
