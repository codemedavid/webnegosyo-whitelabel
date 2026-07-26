import {
  SUPERADMIN_BRIDGE_ACTIONS,
  extractBearerToken,
  isBridgeAction,
  validateBridgePayload,
} from '@/lib/superadmin/bridge'

describe('extractBearerToken', () => {
  it('reads the token from a Bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('accepts a lowercase scheme', () => {
    expect(extractBearerToken('bearer abc')).toBe('abc')
  })

  it('ignores trailing whitespace around the token', () => {
    expect(extractBearerToken('Bearer   abc  ')).toBe('abc')
  })

  it('returns null when the header is missing', () => {
    expect(extractBearerToken(null)).toBeNull()
  })

  it('returns null for a non-Bearer scheme', () => {
    expect(extractBearerToken('Basic abc')).toBeNull()
  })

  it('returns null when the scheme has no token', () => {
    expect(extractBearerToken('Bearer')).toBeNull()
    expect(extractBearerToken('Bearer   ')).toBeNull()
  })

  it('does not treat the scheme word as a token', () => {
    expect(extractBearerToken('Bearer Bearer')).toBe('Bearer')
  })
})

describe('SUPERADMIN_BRIDGE_ACTIONS', () => {
  it('exposes exactly the operations that need the service role', () => {
    // Anything reachable under the caller's own RLS grant must NOT be here —
    // the app talks to Supabase directly for those.
    expect(Object.keys(SUPERADMIN_BRIDGE_ACTIONS).sort()).toEqual([
      'convex-deploy',
      'mcp-key-create',
      'mcp-key-revoke',
      'mcp-keys-list',
      'parse-menu',
      'staff-create',
      'staff-remove',
      'staff-reset-password',
      'supabase-deploy',
    ])
  })

  it('declares the required fields for every action', () => {
    for (const action of Object.values(SUPERADMIN_BRIDGE_ACTIONS)) {
      expect(Array.isArray(action.requiredFields)).toBe(true)
    }
  })
})

describe('isBridgeAction', () => {
  it('accepts a registered action', () => {
    expect(isBridgeAction('convex-deploy')).toBe(true)
  })

  it('rejects an unregistered action', () => {
    expect(isBridgeAction('drop-tables')).toBe(false)
  })

  it('rejects a prototype property masquerading as an action', () => {
    // Object lookup without a guard would resolve these off Object.prototype.
    expect(isBridgeAction('constructor')).toBe(false)
    expect(isBridgeAction('__proto__')).toBe(false)
    expect(isBridgeAction('toString')).toBe(false)
  })
})

describe('validateBridgePayload', () => {
  it('accepts a payload carrying every required field', () => {
    expect(
      validateBridgePayload('convex-deploy', { tenantId: 't1' })
    ).toEqual({ ok: true })
  })

  it('names the missing field', () => {
    expect(validateBridgePayload('convex-deploy', {})).toMatchObject({
      ok: false,
      error: expect.stringMatching(/tenantId/),
    })
  })

  it('rejects a blank string as missing', () => {
    expect(validateBridgePayload('convex-deploy', { tenantId: '   ' }).ok).toBe(
      false
    )
  })

  it('rejects a non-object payload', () => {
    expect(validateBridgePayload('convex-deploy', null).ok).toBe(false)
    expect(validateBridgePayload('convex-deploy', 'tenant').ok).toBe(false)
  })

  it('rejects an unknown action outright', () => {
    expect(validateBridgePayload('drop-tables', {})).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unknown action/i),
    })
  })

  it('accepts an action that requires no fields', () => {
    expect(validateBridgePayload('mcp-keys-list', {})).toEqual({ ok: true })
  })

  it('requires both tenant and user for a staff removal', () => {
    expect(validateBridgePayload('staff-remove', { tenantId: 't1' }).ok).toBe(
      false
    )
    expect(
      validateBridgePayload('staff-remove', { tenantId: 't1', userId: 'u1' })
    ).toEqual({ ok: true })
  })
})
