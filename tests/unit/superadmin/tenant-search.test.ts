import {
  TENANT_SEARCH_MAX_LENGTH,
  buildTenantSearchFilter,
  normalizeTenantSearch,
  parseTenantListQuery,
  parseTenantMetricsIds,
} from '@/lib/superadmin/tenant-search'

describe('normalizeTenantSearch', () => {
  test('trims and collapses inner whitespace', () => {
    expect(normalizeTenantSearch('  sea   cook ')).toBe('sea cook')
  })

  test('returns an empty string for blank or missing input', () => {
    expect(normalizeTenantSearch('   ')).toBe('')
    expect(normalizeTenantSearch(null)).toBe('')
    expect(normalizeTenantSearch(undefined)).toBe('')
  })

  test('caps the term length', () => {
    const long = 'a'.repeat(TENANT_SEARCH_MAX_LENGTH + 50)
    expect(normalizeTenantSearch(long)).toHaveLength(TENANT_SEARCH_MAX_LENGTH)
  })
})

describe('buildTenantSearchFilter', () => {
  test('matches name, slug and custom domain with quoted ilike values', () => {
    expect(buildTenantSearchFilter('seacook')).toBe(
      'name.ilike."%seacook%",slug.ilike."%seacook%",domain.ilike."%seacook%"',
    )
  })

  test('keeps PostgREST separators inside the quoted value', () => {
    const filter = buildTenantSearchFilter('Mama, Cebu (Main)')
    expect(filter.split('",')).toHaveLength(3)
    expect(filter).toContain('name.ilike."%Mama, Cebu (Main)%"')
  })

  test('escapes LIKE wildcards so they match literally', () => {
    // % and _ are LIKE-escaped with a backslash, which is then escaped again
    // for the PostgREST quoted string.
    expect(buildTenantSearchFilter('50%_off')).toContain(
      'name.ilike."%50\\\\%\\\\_off%"',
    )
  })

  test('escapes double quotes and backslashes for the quoted value', () => {
    expect(buildTenantSearchFilter('a"b')).toContain('name.ilike."%a\\"b%"')
    expect(buildTenantSearchFilter('a\\b')).toContain(
      'name.ilike."%a\\\\\\\\b%"',
    )
  })
})

describe('parseTenantListQuery', () => {
  test('applies defaults for an empty query string', () => {
    expect(parseTenantListQuery(new URLSearchParams())).toEqual({
      success: true,
      data: { search: '', page: 1, status: 'all', feature: 'all', sort: 'recent' },
    })
  })

  test('parses and normalises every field', () => {
    const params = new URLSearchParams(
      'q=  sea  cook &page=3&status=active&feature=bundles&sort=name',
    )
    expect(parseTenantListQuery(params)).toEqual({
      success: true,
      data: { search: 'sea cook', page: 3, status: 'active', feature: 'bundles', sort: 'name' },
    })
  })

  test('rejects unknown enum values and non-positive pages', () => {
    expect(parseTenantListQuery(new URLSearchParams('status=deleted')).success).toBe(false)
    expect(parseTenantListQuery(new URLSearchParams('sort=random')).success).toBe(false)
    expect(parseTenantListQuery(new URLSearchParams('page=0')).success).toBe(false)
    expect(parseTenantListQuery(new URLSearchParams('page=abc')).success).toBe(false)
  })
})

describe('parseTenantMetricsIds', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '22222222-2222-4222-8222-222222222222'

  test('parses a comma-separated uuid list and drops duplicates', () => {
    expect(parseTenantMetricsIds(`${A},${B},${A}`)).toEqual({
      success: true,
      data: [A, B],
    })
  })

  test('rejects a missing, empty, malformed or oversized list', () => {
    expect(parseTenantMetricsIds(null).success).toBe(false)
    expect(parseTenantMetricsIds('').success).toBe(false)
    expect(parseTenantMetricsIds(`${A},not-a-uuid`).success).toBe(false)
    const tooMany = Array.from({ length: 51 }, (_, i) =>
      `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
    ).join(',')
    expect(parseTenantMetricsIds(tooMany).success).toBe(false)
  })
})
