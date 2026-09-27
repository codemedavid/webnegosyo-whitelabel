/** @jest-environment node */

import { getPairingRules, resolveRuleBasedSuggestions } from '@/lib/pairing-rules-service'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const mockAuthorize = jest.fn()
const mockAdmin = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => mockAuthorize(...args),
  verifySuperadmin: jest.fn(),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockAdmin() }))

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
// Model row predicates, including embedded menu item filters. The service role
// has no RLS here: foreign rows disappear only when the query scopes them.
function query(table: string) {
  let rows = [...(tables[table] ?? [])]
  const chain = {
    select: () => chain,
    or: () => chain,
    order: () => chain,
    limit: (count: number) => { rows = rows.slice(0, count); return chain },
    eq: (column: string, value: unknown) => {
      rows = rows.filter(row => column.split('.').reduce<unknown>((current, key) => (current as Row)?.[key], row) === value)
      return chain
    },
    in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return chain },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthorize.mockResolvedValue(undefined)
  tables = {}
  mockAdmin.mockReturnValue({ from: query })
})

it('rejects unauthorized admin rule reads before service-role access', async () => {
  mockAuthorize.mockRejectedValue(new Error('Unauthorized'))
  await expect(getPairingRules(TENANT)).rejects.toThrow('Unauthorized')
  expect(mockAdmin).not.toHaveBeenCalled()
})

it('requires analytics access for the requested tenant', async () => {
  await getPairingRules(TENANT)
  expect(mockAuthorize).toHaveBeenCalledWith(TENANT, 'analytics')
})

it('refuses a tenant filter injection before public resolution reaches the database', async () => {
  await expect(resolveRuleBasedSuggestions('item', 'category', `${TENANT},tenant_id.not.is.null`)).rejects.toThrow()
  expect(mockAdmin).not.toHaveBeenCalled()
})

it.each(['category', 'tag', 'handpick'])('keeps %s recommendations within the requested tenant', async mode => {
  const own = { id: 'own-item', tenant_id: TENANT, category_id: 'target-category', is_available: true }
  const foreign = { ...own, id: 'foreign-item', tenant_id: OTHER }
  tables = {
    pairing_rules: [{ id: 'rule', tenant_id: null, source_type: 'category', source_category_id: 'source-category', is_active: true, max_suggestions: 4 }],
    pairing_rule_targets: [{ id: 'target', rule_id: 'rule', target_type: mode === 'tag' ? 'tag' : 'category', target_category_id: 'target-category', target_tag_id: 'shared-tag', selection_mode: mode === 'handpick' ? 'handpick' : 'any' }],
    menu_items: [foreign, own],
    menu_item_tags: [foreign, own].map(menu_item => ({ tenant_id: menu_item.tenant_id, menu_item_id: menu_item.id, tag_definition_id: 'shared-tag', menu_item })),
    pairing_rule_target_items: [foreign, own].map(menu_item => ({ target_id: 'target', menu_item })),
  }
  expect(await resolveRuleBasedSuggestions('source-item', 'source-category', TENANT)).toEqual([own])
})
