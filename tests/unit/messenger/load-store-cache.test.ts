/** @jest-environment node */
/**
 * The webhook's cached store rows (`loadCachedStoreBundle`): what goes into the
 * data cache, under which tags, and what never does.
 */
jest.mock('server-only', () => ({}))

const cacheCalls: Array<{ keyParts: string[]; tags: string[]; revalidate: number | false | undefined }> = []
const revalidateTag = jest.fn()
// A tiny stand-in for the data cache: resolved results are kept per key, rejections are not.
const stored = new Map<string, unknown>()
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { tags: string[]; revalidate?: number }) => {
    cacheCalls.push({ keyParts, tags: options.tags, revalidate: options.revalidate })
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args])
      if (stored.has(key)) return stored.get(key)
      const value = await fn(...args)
      stored.set(key, value)
      return value
    }
  },
  revalidateTag: (tag: string) => revalidateTag(tag),
}))

const getStorefrontMenu = jest.fn()
jest.mock('@/lib/storefront/storefront-menu', () => ({ getStorefrontMenu: (slug: string) => getStorefrontMenu(slug) }))

type Read = { data: unknown; error: { code?: string; message: string } | null }
const selects: Array<{ table: string; columns: string }> = []
const reads: Record<string, Read> = {}
jest.mock('@/lib/messenger/service-db', () => ({
  messengerDb: () => ({
    from: (table: string) => {
      let picked: string[] = []
      // Like PostgREST: only the selected columns come back.
      const project = (row: unknown) => (row && typeof row === 'object' && !Array.isArray(row)
        ? Object.fromEntries(Object.entries(row).filter(([key]) => picked.includes(key)))
        : row)
      const query = {
        select: (columns: string) => {
          selects.push({ table, columns })
          picked = columns.split(',').map((column) => column.trim())
          return query
        },
        eq: () => query,
        order: () => query,
        limit: async () => reads[table],
        maybeSingle: async () => ({ ...reads[table], data: project(reads[table].data) }),
      }
      return query
    },
  }),
}))

import {
  loadCachedStoreBundle, loadCachedTakeoverMinutes, loadStoreBundle, loadTesterCode, messengerConfigTag, revalidateMessengerConfig,
} from '@/lib/messenger/load-store'
import { storefrontTenantIdTag } from '@/lib/storefront/cached-read'

const TENANT_ID = '0b0c9d3c-1111-4000-8000-0000000000aa'
const TENANT_ROW = {
  id: TENANT_ID, slug: 'karamotan', name: 'Karamotan', domain: null, logo_url: null, operating_hours: null, timezone: 'Asia/Manila',
  restaurant_address: null, footer_address: null, facebook_page_id: 'row-1',
}
const SETTINGS_ROW = {
  bot_enabled: false, takeover_minutes: 240, rules_customized_at: null, rules_version: 3,
  profile_hash: null, profile_fields: null, messages: null, order_updates: null,
  tester_psid: 'OWNER-PSID', tester_code_hash: 'abc', tester_code_expires_at: '2026-11-16T10:00:00.000Z',
}

beforeEach(() => {
  stored.clear()
  cacheCalls.length = 0
  selects.length = 0
  revalidateTag.mockReset()
  getStorefrontMenu.mockReset().mockResolvedValue({ status: 'ready', categories: [], menuItems: [] })
  reads.tenants = { data: TENANT_ROW, error: null }
  reads.messenger_settings = { data: SETTINGS_ROW, error: null }
  reads.messenger_rules = { data: [], error: null }
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('loadCachedStoreBundle', () => {
  it('builds the same bundle as the fresh read, from cached rows tagged by store', async () => {
    const cached = await loadCachedStoreBundle(TENANT_ID)
    expect(cached).toMatchObject({ tenantId: TENANT_ID, slug: 'karamotan', facebookPageRowId: 'row-1' })
    expect(cached?.settings).toMatchObject({ botEnabled: false, takeoverMinutes: 240, rulesVersion: 3 })
    expect(cacheCalls).toHaveLength(1)
    expect(cacheCalls[0].tags).toEqual([messengerConfigTag(TENANT_ID), storefrontTenantIdTag(TENANT_ID)])
    expect(cacheCalls[0].revalidate).toBe(300)
    expect(cacheCalls[0].keyParts[0]).toBe('messenger-store-rows')
  })

  it("never puts the owner's test-link fields in the shared cache", async () => {
    const cached = await loadCachedStoreBundle(TENANT_ID)
    const settingsRead = selects.find((read) => read.table === 'messenger_settings')
    expect(settingsRead?.columns).not.toMatch(/tester/)
    expect(cached?.settings).toMatchObject({ testerPsid: null, testerCodeHash: null, testerCodeExpiresAt: null })
  })

  it('the fresh read (editor, test sends) still carries them', async () => {
    const fresh = await loadStoreBundle(TENANT_ID)
    expect(fresh?.settings).toMatchObject({ testerPsid: 'OWNER-PSID', testerCodeHash: 'abc' })
  })

  it('a second message in the window reads nothing', async () => {
    await loadCachedStoreBundle(TENANT_ID)
    const readsAfterFirst = selects.length
    await loadCachedStoreBundle(TENANT_ID)
    expect(selects.length).toBe(readsAfterFirst)
    expect(getStorefrontMenu).toHaveBeenCalledTimes(2) // the menu has its own cache entry
  })

  it('a failed read reaches this message but is not cached', async () => {
    reads.messenger_rules = { data: null, error: { message: 'timeout' } }
    const bundle = await loadCachedStoreBundle(TENANT_ID)
    expect(bundle?.settings.isCustomized).toBe(false)
    const readsAfterFirst = selects.length
    reads.messenger_rules = { data: [], error: null }
    await loadCachedStoreBundle(TENANT_ID)
    expect(selects.length).toBeGreaterThan(readsAfterFirst)
  })

  it('an unreadable store answers nothing and is not cached', async () => {
    reads.tenants = { data: null, error: { code: '57014', message: 'timeout' } }
    expect(await loadCachedStoreBundle(TENANT_ID)).toBeNull()
    reads.tenants = { data: TENANT_ROW, error: null }
    expect(await loadCachedStoreBundle(TENANT_ID)).toMatchObject({ slug: 'karamotan' })
  })

  it('the staff-takeover minutes come from the same cached rows', async () => {
    expect(await loadCachedTakeoverMinutes(TENANT_ID)).toBe(240)
    stored.clear()
    reads.tenants = { data: null, error: null }
    expect(await loadCachedTakeoverMinutes(TENANT_ID)).toBe(60)
  })
})

describe('loadTesterCode', () => {
  it('reads the pending code fresh', async () => {
    expect(await loadTesterCode(TENANT_ID)).toEqual({ hash: 'abc', expiresAt: new Date('2026-11-16T10:00:00.000Z') })
    expect(cacheCalls).toHaveLength(0)
  })

  it('unreadable = no code', async () => {
    reads.messenger_settings = { data: null, error: { code: '57014', message: 'timeout' } }
    expect(await loadTesterCode(TENANT_ID)).toEqual({ hash: null, expiresAt: null })
  })
})

it("revalidateMessengerConfig drops this store's cached rows only", () => {
  revalidateMessengerConfig(TENANT_ID)
  expect(revalidateTag).toHaveBeenCalledWith(`messenger-config:${TENANT_ID}`)
})
