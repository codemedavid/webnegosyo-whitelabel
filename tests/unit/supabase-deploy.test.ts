import { describe, it, expect, jest, afterEach } from '@jest/globals'
import {
  SUPABASE_ORDER_SCHEMA_VERSION,
  deployOrderSchema,
  validateSupabaseProject,
  type SqlRunner,
} from '@/lib/supabase-deploy'

const originalFetch = global.fetch

function mockFetch(impl: () => Promise<Response>) {
  global.fetch = jest.fn(impl) as unknown as typeof fetch
}

afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

describe('SUPABASE_ORDER_SCHEMA_VERSION', () => {
  it('is a positive integer (mirrors Convex CURRENT_SCHEMA_VERSION)', () => {
    expect(Number.isInteger(SUPABASE_ORDER_SCHEMA_VERSION)).toBe(true)
    expect(SUPABASE_ORDER_SCHEMA_VERSION).toBeGreaterThan(0)
  })
})

describe('deployOrderSchema', () => {
  it('runs the bundle SQL and returns success with the current schema version', async () => {
    const runSql = jest.fn<SqlRunner>(async () => {})
    const result = await deployOrderSchema('create table if not exists orders();', runSql)

    expect(runSql).toHaveBeenCalledTimes(1)
    expect(runSql).toHaveBeenCalledWith('create table if not exists orders();')
    expect(result).toEqual({ success: true, schemaVersion: SUPABASE_ORDER_SCHEMA_VERSION })
  })

  it('does not run an empty bundle and reports the misconfiguration', async () => {
    const runSql = jest.fn<SqlRunner>(async () => {})
    const result = await deployOrderSchema('   ', runSql)

    expect(runSql).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/empty|bundle/i)
  })

  it('surfaces the runner error message instead of throwing', async () => {
    const runSql = jest.fn(async () => {
      throw new Error('permission denied for schema public')
    })
    const result = await deployOrderSchema('create table orders();', runSql)

    expect(result.success).toBe(false)
    expect(result.error).toContain('permission denied')
    expect(result.schemaVersion).toBe(0)
  })

  it('handles a non-Error thrown value gracefully', async () => {
    const runSql = jest.fn(async () => {
      throw 'raw string failure'
    })
    const result = await deployOrderSchema('create table orders();', runSql)

    expect(result.success).toBe(false)
    expect(typeof result.error).toBe('string')
  })
})

describe('validateSupabaseProject', () => {
  const URL = 'https://abcdefgh.supabase.co'
  const KEY = 'service-role-key'

  it('is valid when the REST endpoint is reachable (2xx/404)', async () => {
    mockFetch(async () => ({ status: 200 }) as Response)
    expect(await validateSupabaseProject(URL, KEY)).toBe(true)
  })

  it('is invalid on 401 unauthorized', async () => {
    mockFetch(async () => ({ status: 401 }) as Response)
    expect(await validateSupabaseProject(URL, KEY)).toBe(false)
  })

  it('is invalid on 403 forbidden', async () => {
    mockFetch(async () => ({ status: 403 }) as Response)
    expect(await validateSupabaseProject(URL, KEY)).toBe(false)
  })

  it('is invalid (not throwing) when the network request fails', async () => {
    mockFetch(async () => { throw new Error('ENOTFOUND') })
    expect(await validateSupabaseProject(URL, KEY)).toBe(false)
  })
})
