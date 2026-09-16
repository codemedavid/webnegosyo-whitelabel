/**
 * @jest-environment node
 *
 * Server actions are public POST endpoints, and these five modules write
 * through the service-role client — which bypasses RLS — so the ONLY thing
 * between an anonymous caller and another store's data is a `verify*` call
 * that runs before the first write. These tests pin that call: it must
 * happen, it must name the right tenant and permission, and when it refuses,
 * nothing may reach the database.
 *
 * The audit that produced these found a `tenantId: null` pairing rule
 * resolves as PLATFORM-WIDE, preset tags are the list every store's editor
 * renders, and the lead pipeline is prospective merchants' PII.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const verifyTenantPermission = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const verifySuperadmin = jest.fn<(...args: unknown[]) => Promise<unknown>>()

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
  verifySuperadmin: (...args: unknown[]) => verifySuperadmin(...args),
}))

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/redis-cache', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  deleteCached: jest.fn(),
  invalidateCache: jest.fn(),
  invalidateCachePattern: jest.fn(),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

/**
 * A chainable stand-in for the service-role client. Every builder method
 * returns the same chain; awaiting it (or `.single()`) resolves to the
 * response queued for that table. Writes are recorded so a test can prove
 * none happened.
 */
interface Fake {
  client: { from: jest.Mock<(table: string) => Record<string, unknown>> }
  writes: Array<{ table: string; op: string; payload?: unknown }>
  filters: Array<{ table: string; op: string; args: unknown[] }>
  respond: (table: string, response: { data: unknown; error: unknown }) => void
}
function makeFakeAdmin(): Fake {
  const writes: Fake['writes'] = []
  const filters: Fake['filters'] = []
  const responses = new Map<string, { data: unknown; error: unknown }>()
  const from = jest.fn((table: string) => {
    const response = () => responses.get(table) ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}
    const filterOps = ['eq', 'neq', 'is', 'in', 'not', 'or', 'select', 'order', 'limit', 'maybeSingle']
    for (const op of filterOps) {
      chain[op] = (...args: unknown[]) => {
        filters.push({ table, op, args })
        return chain
      }
    }
    for (const op of ['insert', 'update', 'delete', 'upsert']) {
      chain[op] = (payload?: unknown) => {
        writes.push({ table, op, payload })
        return chain
      }
    }
    chain.single = () => Promise.resolve(response())
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response()).then(resolve)
    return chain
  })
  return {
    client: { from },
    writes,
    filters,
    respond: (table, response) => responses.set(table, response),
  }
}

let fake: Fake
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fake.client,
}))

const REFUSED = new Error('Unauthorized: Not admin of this tenant')

beforeEach(() => {
  fake = makeFakeAdmin()
  verifyTenantPermission.mockReset().mockResolvedValue(undefined)
  verifySuperadmin.mockReset().mockResolvedValue(undefined)
})

const rule = {
  name: 'Drinks with mains',
  sourceType: 'category' as const,
  sourceCategoryId: 'cat-mains',
  maxSuggestions: 3,
  targets: [{ targetType: 'category' as const, targetCategoryId: 'cat-drinks', selectionMode: 'any' as const }],
}

describe('pairing rules', () => {
  test('a tenant rule is created only for a caller with the analytics permission', async () => {
    // Arrange
    const { createPairingRule } = await import('@/lib/pairing-rules-service')
    fake.respond('pairing_rules', { data: { id: 'r1' }, error: null })
    fake.respond('pairing_rule_targets', { data: { id: 't1' }, error: null })

    // Act
    await createPairingRule('tenant-1', rule)

    // Assert
    expect(verifyTenantPermission).toHaveBeenCalledWith('tenant-1', 'analytics')
    expect(fake.writes[0]).toMatchObject({ table: 'pairing_rules', op: 'insert' })
  })

  test('a refused caller writes nothing', async () => {
    // Arrange
    const { createPairingRule } = await import('@/lib/pairing-rules-service')
    verifyTenantPermission.mockRejectedValue(REFUSED)

    // Act / Assert
    await expect(createPairingRule('tenant-1', rule)).rejects.toThrow(REFUSED)
    expect(fake.writes).toHaveLength(0)
  })

  test('a platform-wide (null tenant) rule requires a superadmin', async () => {
    // A null tenant_id rule is shown on EVERY store; this was open to anyone.
    // Arrange
    const { createPairingRule } = await import('@/lib/pairing-rules-service')
    verifySuperadmin.mockRejectedValue(new Error('Forbidden'))

    // Act / Assert
    await expect(createPairingRule(null, rule)).rejects.toThrow('Forbidden')
    expect(verifyTenantPermission).not.toHaveBeenCalled()
    expect(fake.writes).toHaveLength(0)
  })

  test('updating a rule is scoped to the caller tenant, not just the rule id', async () => {
    // Arrange
    const { updatePairingRule } = await import('@/lib/pairing-rules-service')
    fake.respond('pairing_rules', { data: { id: 'r1', tenant_id: 'tenant-1' }, error: null })
    fake.respond('pairing_rule_targets', { data: { id: 't1' }, error: null })

    // Act
    await updatePairingRule('r1', 'tenant-1', rule)

    // Assert
    expect(verifyTenantPermission).toHaveBeenCalledWith('tenant-1', 'analytics')
    const updateIndex = fake.filters.findIndex(
      (f) => f.table === 'pairing_rules' && f.op === 'eq' && f.args[0] === 'tenant_id' && f.args[1] === 'tenant-1'
    )
    expect(updateIndex).toBeGreaterThan(-1)
  })

  test('toggling looks up the rule owner and guards on that tenant', async () => {
    // The action only carries a rule id, so the tenant to authorize against
    // must come from the row — never from the caller.
    // Arrange
    const { togglePairingRule } = await import('@/lib/pairing-rules-service')
    fake.respond('pairing_rules', { data: { id: 'r1', tenant_id: 'tenant-9' }, error: null })

    // Act
    await togglePairingRule('r1', false)

    // Assert
    expect(verifyTenantPermission).toHaveBeenCalledWith('tenant-9', 'analytics')
    expect(fake.writes).toEqual([
      expect.objectContaining({ table: 'pairing_rules', op: 'update' }),
    ])
  })

  test('toggling an unknown rule writes nothing', async () => {
    // Arrange
    const { togglePairingRule } = await import('@/lib/pairing-rules-service')
    fake.respond('pairing_rules', { data: null, error: null })

    // Act / Assert
    await expect(togglePairingRule('missing', true)).rejects.toThrow(/not found/i)
    expect(fake.writes).toHaveLength(0)
  })
})

describe('tags', () => {
  test('tenant tag writes need the menu permission', async () => {
    // Arrange
    const { createTagDefinition, setItemTags } = await import('@/lib/tags-service')
    fake.respond('tag_definitions', { data: [{ id: 'tag-1' }], error: null })

    // Act
    await createTagDefinition('tenant-1', 'Diet', 'Vegan')
    await setItemTags('item-1', 'tenant-1', ['tag-1'])

    // Assert
    expect(verifyTenantPermission).toHaveBeenNthCalledWith(1, 'tenant-1', 'menu')
    expect(verifyTenantPermission).toHaveBeenNthCalledWith(2, 'tenant-1', 'menu')
  })

  test("an item can only carry its own store's tags or presets", async () => {
    // Arrange
    const { setItemTags } = await import('@/lib/tags-service')
    // Only one of the two requested ids belongs to this tenant / the presets.
    fake.respond('tag_definitions', { data: [{ id: 'tag-mine' }], error: null })

    // Act / Assert
    await expect(setItemTags('item-1', 'tenant-1', ['tag-mine', 'tag-theirs'])).rejects.toThrow(
      /not available/i
    )
    expect(fake.writes).toHaveLength(0)
  })

  test('preset tags — the list every store sees — are superadmin only', async () => {
    // Arrange
    const { createPresetTag, deletePresetTag } = await import('@/lib/tags-service')
    verifySuperadmin.mockRejectedValue(new Error('Forbidden'))

    // Act / Assert
    await expect(createPresetTag('Diet', 'Halal')).rejects.toThrow('Forbidden')
    await expect(deletePresetTag('preset-1')).rejects.toThrow('Forbidden')
    expect(fake.writes).toHaveLength(0)
  })
})

describe('complementary pairs', () => {
  test('every write is guarded on the analytics permission', async () => {
    // Arrange
    const svc = await import('@/lib/complementary-pairs-service')

    // Act
    await svc.createComplementaryPairs('tenant-1', 'item', 'src', ['t1'])
    await svc.deleteComplementaryPair('pair-1', 'tenant-1')
    await svc.deleteComplementaryPairsForSource('tenant-1', 'item', 'src')

    // Assert
    expect(verifyTenantPermission).toHaveBeenCalledTimes(3)
    for (const call of verifyTenantPermission.mock.calls) {
      expect(call).toEqual(['tenant-1', 'analytics'])
    }
  })

  test('a refused caller gets a failure result and no write', async () => {
    // These return {success,error} rather than throwing, and the UI reads it.
    // Arrange
    const { createComplementaryPairs } = await import('@/lib/complementary-pairs-service')
    verifyTenantPermission.mockRejectedValue(REFUSED)

    // Act
    const result = await createComplementaryPairs('tenant-1', 'item', 'src', ['t1'])

    // Assert
    expect(result).toEqual({ success: false, error: REFUSED.message })
    expect(fake.writes).toHaveLength(0)
  })
})

describe('menu engineering pair suggestions', () => {
  test('accepting a suggestion inserts only for a permitted caller', async () => {
    // Arrange
    const { acceptPairSuggestion, bulkAcceptPairSuggestions, generateSmartPairSuggestions } =
      await import('@/lib/menu-engineering-service')

    // Act
    await acceptPairSuggestion('tenant-1', 'a', 'b', 'star_to_star')
    await bulkAcceptPairSuggestions('tenant-1', [{ sourceItemId: 'a', targetItemId: 'b', strategy: 's' }])
    await generateSmartPairSuggestions('tenant-1')

    // Assert
    expect(verifyTenantPermission).toHaveBeenCalledTimes(3)
    expect(verifyTenantPermission).toHaveBeenCalledWith('tenant-1', 'analytics')
  })

  test('a refused caller inserts nothing', async () => {
    // Arrange
    const { acceptPairSuggestion } = await import('@/lib/menu-engineering-service')
    verifyTenantPermission.mockRejectedValue(REFUSED)

    // Act / Assert
    await expect(acceptPairSuggestion('tenant-1', 'a', 'b', 's')).rejects.toThrow(REFUSED)
    expect(fake.writes).toHaveLength(0)
  })
})

describe('leads', () => {
  test('the lead pipeline is superadmin only, read and write', async () => {
    // Arrange
    const actions = await import('@/app/actions/leads')
    verifySuperadmin.mockRejectedValue(new Error('Forbidden'))

    // Act / Assert
    await expect(actions.fetchLeads({})).rejects.toThrow('Forbidden')
    await expect(actions.fetchLeadDetail('lead-1')).rejects.toThrow('Forbidden')
    await expect(actions.changeLeadStatus('lead-1', 'new', 'lost')).rejects.toThrow('Forbidden')
    await expect(actions.addLeadNote('lead-1', 'hi')).rejects.toThrow('Forbidden')
    expect(fake.client.from).not.toHaveBeenCalled()
  })
})
