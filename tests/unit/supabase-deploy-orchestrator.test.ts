import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import {
  runTenantSupabaseDeploy,
  SUPABASE_ORDER_SCHEMA_VERSION,
  type TenantDeployDeps,
} from '@/lib/supabase-deploy'

const BUNDLE = 'create table if not exists public.orders();'

const FULL_CREDS = {
  supabase_order_url: 'https://abcdefgh.supabase.co',
  supabase_order_anon_key: 'anon-key',
  supabase_order_service_key: 'service-key',
  supabase_order_db_url:
    'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
}

let validate: jest.Mock<TenantDeployDeps['validate']>
let applySchema: jest.Mock<TenantDeployDeps['applySchema']>
let deps: TenantDeployDeps

beforeEach(() => {
  validate = jest.fn<TenantDeployDeps['validate']>(async () => true)
  applySchema = jest.fn<TenantDeployDeps['applySchema']>(async () => {})
  deps = { validate, applySchema }
})

describe('runTenantSupabaseDeploy', () => {
  it('deploys the bundle over the tenant db url and bumps to the current version', async () => {
    const result = await runTenantSupabaseDeploy(FULL_CREDS, BUNDLE, deps)

    expect(validate).toHaveBeenCalledWith(
      FULL_CREDS.supabase_order_url,
      FULL_CREDS.supabase_order_service_key
    )
    expect(applySchema).toHaveBeenCalledWith(FULL_CREDS.supabase_order_db_url, BUNDLE)
    expect(result).toEqual({ success: true, schemaVersion: SUPABASE_ORDER_SCHEMA_VERSION })
  })

  it('refuses to deploy when the service key is missing (no validate, no apply)', async () => {
    const result = await runTenantSupabaseDeploy(
      { ...FULL_CREDS, supabase_order_service_key: null },
      BUNDLE,
      deps
    )

    expect(validate).not.toHaveBeenCalled()
    expect(applySchema).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/credential/i)
  })

  it('refuses to deploy when the db connection string is missing', async () => {
    const result = await runTenantSupabaseDeploy(
      { ...FULL_CREDS, supabase_order_db_url: '   ' },
      BUNDLE,
      deps
    )

    expect(applySchema).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/connection string|db/i)
  })

  it('fails without applying when the project/credentials are invalid', async () => {
    validate.mockResolvedValueOnce(false)

    const result = await runTenantSupabaseDeploy(FULL_CREDS, BUNDLE, deps)

    expect(applySchema).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid/i)
  })

  it('surfaces a DDL failure as a result instead of throwing', async () => {
    applySchema.mockRejectedValueOnce(new Error('permission denied for schema public'))

    const result = await runTenantSupabaseDeploy(FULL_CREDS, BUNDLE, deps)

    expect(result.success).toBe(false)
    expect(result.error).toContain('permission denied')
    expect(result.schemaVersion).toBe(0)
  })
})
