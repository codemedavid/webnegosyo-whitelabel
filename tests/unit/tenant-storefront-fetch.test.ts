import { fetchActiveTenantBySlug } from '@/lib/queries/fetch-tenant-by-slug'

/**
 * Regression: every storefront rendered "Restaurant not found".
 *
 * `TENANT_STOREFRONT_SELECT` gained `enforce_operating_hours` before the matching
 * migration reached the production database. PostgREST rejects the *entire* query
 * with code 42703 (undefined column), so the tenant lookup returned an error —
 * which the caller conflated with "no such tenant" and rendered the 404 state for
 * every tenant on the platform, even though the row was there all along.
 *
 * A missing branding column must degrade to a default, never take the shop offline.
 */

interface FakeAttempt {
  data: unknown
  error: { code?: string; message: string } | null
}

function createFakeClient(attempts: FakeAttempt[]) {
  const projections: string[] = []

  const client = {
    from: () => ({
      select: (projection: string) => {
        projections.push(projection)
        const attempt = attempts[projections.length - 1] ?? { data: null, error: null }
        const builder = {
          eq: () => builder,
          maybeSingle: async () => attempt,
        }
        return builder
      },
    }),
  }

  return { client, projections }
}

const PROJECTION = 'id, slug, name, enforce_operating_hours'
const UNDEFINED_COLUMN = {
  code: '42703',
  message: 'column tenants.enforce_operating_hours does not exist',
}

describe('fetchActiveTenantBySlug', () => {
  it('returns the tenant on the happy path using the requested projection', async () => {
    // Arrange
    const { client, projections } = createFakeClient([
      { data: { id: 't1', slug: 'luckyjoy' }, error: null },
    ])

    // Act
    const result = await fetchActiveTenantBySlug(client, 'luckyjoy', PROJECTION)

    // Assert
    expect(result.tenant).toEqual({ id: 't1', slug: 'luckyjoy' })
    expect(result.error).toBeNull()
    expect(result.isDegraded).toBe(false)
    expect(projections).toEqual([PROJECTION])
  })

  it('recovers the tenant when a projected column is missing from the database', async () => {
    // Arrange
    const { client, projections } = createFakeClient([
      { data: null, error: UNDEFINED_COLUMN },
      { data: { id: 't1', slug: 'luckyjoy', name: 'Lucky Joy Official' }, error: null },
    ])

    // Act
    const result = await fetchActiveTenantBySlug(client, 'luckyjoy', PROJECTION)

    // Assert
    expect(result.tenant).toMatchObject({ slug: 'luckyjoy' })
    expect(result.error).toBeNull()
    expect(result.isDegraded).toBe(true)
    expect(projections[1]).toBe('*')
  })

  it('reports a genuinely absent tenant as not found without retrying', async () => {
    // Arrange
    const { client, projections } = createFakeClient([{ data: null, error: null }])

    // Act
    const result = await fetchActiveTenantBySlug(client, 'ghost', PROJECTION)

    // Assert
    expect(result.tenant).toBeNull()
    expect(result.error).toBeNull()
    expect(projections).toHaveLength(1)
  })

  it('surfaces a non-column failure instead of masking it as not found', async () => {
    // Arrange
    const { client, projections } = createFakeClient([
      { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
    ])

    // Act
    const result = await fetchActiveTenantBySlug(client, 'luckyjoy', PROJECTION)

    // Assert
    expect(result.tenant).toBeNull()
    expect(result.error).toContain('statement timeout')
    expect(projections).toHaveLength(1)
  })

  it('does not loop when the fallback projection also fails', async () => {
    // Arrange
    const { client, projections } = createFakeClient([
      { data: null, error: UNDEFINED_COLUMN },
      { data: null, error: { code: '42P01', message: 'relation "tenants" does not exist' } },
    ])

    // Act
    const result = await fetchActiveTenantBySlug(client, 'luckyjoy', PROJECTION)

    // Assert
    expect(result.tenant).toBeNull()
    expect(result.error).toContain('does not exist')
    expect(projections).toHaveLength(2)
  })
})
