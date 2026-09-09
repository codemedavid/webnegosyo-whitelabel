/**
 * `src/lib/tenant-secrets.ts` is the only module allowed to touch
 * `public.tenant_secrets`. These tests pin its contract with a recording fake
 * client so every caller can rely on the same shape:
 *
 *  - reads target `tenant_secrets` by `tenant_id` and yield null for no row
 *  - a query error is surfaced, never swallowed into "no secrets"
 *  - writes upsert on `tenant_id` and carry ONLY the keys the caller defined,
 *    so a form that leaves a secret blank cannot wipe the stored value
 */
import {
  getTenantSecrets,
  listTenantSecrets,
  mergeTenantSecrets,
  upsertTenantSecrets,
  TENANT_SECRET_KEYS,
} from '@/lib/tenant-secrets'

interface RecordedCall {
  table: string
  op: 'select' | 'upsert'
  columns?: string
  payload?: unknown
  options?: unknown
  filters: Array<[string, unknown]>
}

interface FakeOptions {
  row?: Record<string, unknown> | null
  rows?: Array<Record<string, unknown>>
  error?: { message: string } | null
}

function fakeClient(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []

  const client = {
    from: (table: string) => {
      const call: RecordedCall = { table, op: 'select', filters: [] }
      calls.push(call)
      const builder: Record<string, unknown> = {}
      builder.select = (columns?: string) => {
        call.op = 'select'
        call.columns = columns
        return builder
      }
      builder.upsert = (payload: unknown, upsertOptions?: unknown) => {
        call.op = 'upsert'
        call.payload = payload
        call.options = upsertOptions
        return builder
      }
      builder.eq = (column: string, value: unknown) => {
        call.filters.push([column, value])
        return builder
      }
      builder.in = (column: string, value: unknown) => {
        call.filters.push([`in:${column}`, value])
        return builder
      }
      builder.maybeSingle = async () => ({
        data: options.row ?? null,
        error: options.error ?? null,
      })
      // Awaiting the builder directly (upsert / list) resolves like PostgREST.
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: options.rows ?? null, error: options.error ?? null })
      return builder
    },
  }

  return { client: client as never, calls }
}

describe('getTenantSecrets', () => {
  test('returns null when the tenant has no secrets row', async () => {
    const { client, calls } = fakeClient({ row: null })

    const result = await getTenantSecrets(client, 'tenant-1')

    expect(result).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('tenant_secrets')
    expect(calls[0].filters).toEqual([['tenant_id', 'tenant-1']])
  })

  test('maps every secret column off the row', async () => {
    const { client, calls } = fakeClient({
      row: {
        tenant_id: 'tenant-1',
        lalamove_api_key: 'lala-key',
        lalamove_secret_key: 'lala-secret',
        messenger_page_access_token: 'page-token',
        convex_deploy_key: 'convex-key',
        loyverse_access_token: 'loy-token',
        updated_at: '2026-09-04T00:00:00Z',
      },
    })

    const result = await getTenantSecrets(client, 'tenant-1')

    expect(result).toEqual({
      lalamove_api_key: 'lala-key',
      lalamove_secret_key: 'lala-secret',
      messenger_page_access_token: 'page-token',
      convex_deploy_key: 'convex-key',
      loyverse_access_token: 'loy-token',
    })
    // The read names its columns: no `*`, no updated_at leaking into callers.
    for (const key of TENANT_SECRET_KEYS) {
      expect(calls[0].columns).toContain(key)
    }
    expect(calls[0].columns).not.toBe('*')
  })

  test('surfaces a query error instead of reporting "no secrets"', async () => {
    const { client } = fakeClient({ error: { message: 'permission denied' } })

    await expect(getTenantSecrets(client, 'tenant-1')).rejects.toThrow(/permission denied/)
  })
})

describe('upsertTenantSecrets', () => {
  test('writes only the keys the caller defined, keyed on tenant_id', async () => {
    const { client, calls } = fakeClient()

    await upsertTenantSecrets(client, 'tenant-1', {
      convex_deploy_key: 'convex-key',
      lalamove_api_key: undefined,
      loyverse_access_token: null,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('tenant_secrets')
    expect(calls[0].op).toBe('upsert')
    expect(calls[0].payload).toEqual({
      tenant_id: 'tenant-1',
      convex_deploy_key: 'convex-key',
      loyverse_access_token: null,
    })
    expect(calls[0].options).toEqual({ onConflict: 'tenant_id' })
  })

  test('does not touch the table when nothing is defined', async () => {
    const { client, calls } = fakeClient()

    await upsertTenantSecrets(client, 'tenant-1', { convex_deploy_key: undefined })

    expect(calls).toHaveLength(0)
  })

  test('surfaces a write error', async () => {
    const { client } = fakeClient({ error: { message: 'row-level security' } })

    await expect(
      upsertTenantSecrets(client, 'tenant-1', { convex_deploy_key: 'k' }),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('listTenantSecrets', () => {
  test('returns a map keyed by tenant id for the requested tenants', async () => {
    const { client, calls } = fakeClient({
      rows: [
        { tenant_id: 'a', convex_deploy_key: 'ka' },
        { tenant_id: 'b', convex_deploy_key: null },
      ],
    })

    const result = await listTenantSecrets(client, ['a', 'b', 'c'])

    expect(calls[0].table).toBe('tenant_secrets')
    expect(calls[0].filters).toEqual([['in:tenant_id', ['a', 'b', 'c']]])
    expect(result.get('a')?.convex_deploy_key).toBe('ka')
    expect(result.get('b')?.convex_deploy_key).toBeNull()
    expect(result.has('c')).toBe(false)
  })

  test('asks nothing of the database for an empty id list', async () => {
    const { client, calls } = fakeClient()

    const result = await listTenantSecrets(client, [])

    expect(result.size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

describe('mergeTenantSecrets', () => {
  test('overlays the secrets on the tenant row without mutating it', () => {
    const tenant = { id: 't', name: 'Store' }

    const merged = mergeTenantSecrets(tenant, { convex_deploy_key: 'k' } as never)

    expect(merged).toMatchObject({ id: 't', name: 'Store', convex_deploy_key: 'k' })
    expect(tenant).toEqual({ id: 't', name: 'Store' })
  })

  test('fills every secret with null when there is no row', () => {
    const merged = mergeTenantSecrets({ id: 't' }, null)

    for (const key of TENANT_SECRET_KEYS) {
      expect(merged[key]).toBeNull()
    }
  })
})
