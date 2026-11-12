/**
 * The "Who can use Owl" switch saves an account's WHOLE permission list, so
 * flipping Owl must change exactly one key — never hand a legacy full-access
 * account the other opt-in keys, never drop a key the account already holds.
 */
import { owlAccessRows, withOwlAccess } from '@/lib/assistant/access-list'
import { OPT_IN_PERMISSION_KEYS, STAFF_PERMISSION_KEYS, isGrantedByFullAccess } from '@/lib/staff-permissions'

describe('withOwlAccess', () => {
  test('a legacy full-access account gains Owl and nothing else', () => {
    const next = withOwlAccess(null, true)
    expect(next).toEqual([...STAFF_PERMISSION_KEYS.filter(isGrantedByFullAccess), 'assistant'])
    for (const key of OPT_IN_PERMISSION_KEYS.filter((k) => k !== 'assistant')) expect(next).not.toContain(key)
  })

  test('a stored list keeps every key, unknown ones too', () => {
    expect(withOwlAccess(['menu', 'expenses', 'future_key'], true)).toEqual(['menu', 'expenses', 'future_key', 'assistant'])
    expect(withOwlAccess(['menu', 'assistant', 'expenses'], false)).toEqual(['menu', 'expenses'])
  })

  test('switching on twice does not duplicate the key', () => {
    expect(withOwlAccess(['pos', 'assistant'], true)).toEqual(['pos', 'assistant'])
  })
})

describe('owlAccessRows', () => {
  const row = (over: Record<string, unknown>) => ({ user_id: 'u', is_owner: false, role: 'admin', outlet_id: null, permissions: ['pos'], display_name: 'Ana', email: 'ana@x.test', ...over })

  test('leaves owners out, reads the opt-in key, flags branch accounts', () => {
    const rows = owlAccessRows([
      row({ user_id: 'owner', is_owner: true, display_name: 'Owner' }),
      row({ user_id: 'b', display_name: 'Ben', permissions: null }),
      row({ user_id: 'a', display_name: 'Ana', permissions: ['assistant'] }),
      row({ user_id: 'c', display_name: 'Cy', outlet_id: 'branch-1', permissions: ['assistant', 'pos'] }),
    ])
    expect(rows.map((r) => [r.userId, r.hasOwl, r.isBranchLocked])).toEqual([
      ['a', true, false],
      ['b', false, false],
      ['c', true, true],
    ])
  })
})
