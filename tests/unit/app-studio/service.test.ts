/** @jest-environment node */
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'

jest.mock('server-only', () => ({}))

type Row = Record<string, unknown>

/** Just the chains App Studio uses, over in-memory tables, with Postgres' unique errors. */
function fakeDb(tables: Record<string, Row[]>) {
  const calls: string[] = []
  const from = (table: string) => {
    const rows = (tables[table] ??= [])
    const filters: [string, unknown][] = []
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select'
    let payload: Row = {}
    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value)
    const run = (): { data: Row[]; error: { message: string; code?: string } | null } => {
      if (op === 'select') return { data: rows.filter(matches), error: null }
      if (op === 'update') {
        const hit = rows.filter(matches)
        hit.forEach((row) => Object.assign(row, payload))
        return { data: hit, error: null }
      }
      const key = payload.tenant_id
      const existing = rows.find((row) => row.tenant_id === key)
      if (existing && op === 'insert') return { data: [], error: { message: `duplicate key value violates unique constraint "${table}_pkey"`, code: '23505' } }
      if (table === 'tenant_apps' && rows.some((row) => row !== existing && (row.bundle_id === payload.bundle_id || row.android_package === payload.android_package)))
        return { data: [], error: { message: 'duplicate key value violates unique constraint "tenant_apps_bundle_id_key"', code: '23505' } }
      if (existing) Object.assign(existing, payload)
      else rows.push({ ...payload })
      return { data: [existing ?? rows[rows.length - 1]], error: null }
    }
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
      update: (value: Row) => ((op = 'update'), (payload = value), calls.push(`update ${table}`), builder),
      insert: (value: Row) => ((op = 'insert'), (payload = value), calls.push(`insert ${table}`), builder),
      upsert: (value: Row) => ((op = 'upsert'), (payload = value), calls.push(`upsert ${table}`), builder),
      maybeSingle: async () => {
        const { data, error } = run()
        return { data: data[0] ?? null, error }
      },
      single: async () => {
        const { data, error } = run()
        return { data: data[0] ?? null, error: error ?? (data[0] ? null : { message: 'no rows' }) }
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return builder
  }
  return { from, calls } as unknown as Parameters<typeof import('@/lib/app-studio/service').readApp>[0] & { calls: string[] }
}

const TENANT = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const service = () => import('@/lib/app-studio/service')

const app = (overrides: Row = {}): Row => ({
  tenant_id: TENANT,
  display_name: 'Kape',
  bundle_id: 'com.webnegosyo.kape',
  android_package: 'com.webnegosyo.kape',
  status: 'draft',
  review_code_hash: null,
  ...overrides,
})

const identity = {
  displayName: 'Kape',
  bundleId: 'com.webnegosyo.kape2',
  androidPackage: 'com.webnegosyo.kape2',
  iconUrl: null,
  splashUrl: null,
  splashBackground: null,
  storeAccount: { apple: 'webnegosyo' as const, google: 'webnegosyo' as const },
}

describe('App Studio service', () => {
  it('sets up a draft app named after the store with ids from its slug', async () => {
    const db = fakeDb({ tenants: [{ id: TENANT, name: 'Kape Demo Coffee Roasters of Quezon City', slug: 'kape-demo' }], tenant_apps: [] })
    const created = await (await service()).createApp(db, TENANT, '#112233')
    expect(created).toMatchObject({ display_name: 'Kape Demo Coffee Roasters of Q', bundle_id: 'com.webnegosyo.kape-demo', android_package: 'com.webnegosyo.kape_demo', status: 'draft', splash_background: '#112233' })
    await expect((await service()).createApp(db, TENANT, null)).rejects.toThrow('This store already has an app.')
  })

  it('changes ids while a draft, refuses once live, and names a clash with another store', async () => {
    const { saveIdentity } = await service()
    const db = fakeDb({ tenant_apps: [app(), app({ tenant_id: OTHER, bundle_id: 'com.webnegosyo.taken', android_package: 'com.webnegosyo.taken' })] })
    await expect(saveIdentity(db, TENANT, identity, app() as never)).resolves.toMatchObject({ bundle_id: 'com.webnegosyo.kape2' })
    await expect(saveIdentity(db, TENANT, { ...identity, bundleId: 'com.webnegosyo.other' }, app({ status: 'live', bundle_id: 'com.webnegosyo.kape2', android_package: 'com.webnegosyo.kape2' }) as never)).rejects.toThrow('locked once the app has gone live')
  })

  it('an update that touched no row is an error, never "saved"', async () => {
    const db = fakeDb({ tenant_apps: [] })
    await expect((await service()).saveListing(db, TENANT, { subtitle: '', promotionalText: '', description: '', keywords: '', supportUrl: null, privacyUrl: null, category: 'food_and_drink' })).rejects.toThrow('no longer exists')
  })

  it('stores only the hash of the review code it hands back', async () => {
    const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })
    const tables = { tenant_apps: [app()] }
    const { app: saved, code } = await (await service()).issueReviewCode(fakeDb(tables), TENANT, '+639990000123', crypto)
    expect(code).toMatch(/^[0-9]{6}$/)
    expect(saved.hasReviewCode).toBe(true)
    expect(saved).not.toHaveProperty('review_code_hash')
    expect(tables.tenant_apps[0].review_code_hash).toBe(crypto.hashAppReviewCode(TENANT, code))
  })

  it('publishes on the version the editor saw; a second publisher is told to reload', async () => {
    const { publishDraft } = await service()
    const tables = { tenant_app_configs: [] as Row[] }
    const draft = { copy: { greeting: 'Hi' } }
    await expect(publishDraft(fakeDb(tables), TENANT, draft, 0, 'u1')).resolves.toMatchObject({ version: 1 })
    expect(tables.tenant_app_configs[0]).toMatchObject({ published: draft, draft, published_version: 1 })
    await expect(publishDraft(fakeDb(tables), TENANT, draft, 0, 'u2')).rejects.toThrow('Someone else just published')
    await expect(publishDraft(fakeDb(tables), TENANT, { copy: { greeting: 'Yo' } }, 1, 'u2')).resolves.toMatchObject({ version: 2 })
  })

  it('a saved draft that differs from what is served counts as unpublished', async () => {
    const { hasUnpublished } = await service()
    expect(hasUnpublished({}, null)).toBe(false)
    expect(hasUnpublished({ copy: { greeting: 'Hi' } }, null)).toBe(true)
    expect(hasUnpublished({ copy: { greeting: 'Hi' } }, { copy: { greeting: 'Hi' } })).toBe(false)
  })
})
