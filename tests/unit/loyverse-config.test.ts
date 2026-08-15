import {
  resolveLoyverseConfig,
  resolveLoyversePushMode,
  LOYVERSE_PUSH_MODES,
} from '@/lib/loyverse/config'

describe('resolveLoyversePushMode', () => {
  it('defaults to on_confirm when unset', () => {
    expect(resolveLoyversePushMode(null)).toBe('on_confirm')
    expect(resolveLoyversePushMode(undefined)).toBe('on_confirm')
    expect(resolveLoyversePushMode('')).toBe('on_confirm')
  })

  it('returns known modes verbatim', () => {
    for (const mode of LOYVERSE_PUSH_MODES) {
      expect(resolveLoyversePushMode(mode)).toBe(mode)
    }
  })

  it('coerces unknown values to on_confirm rather than trusting them', () => {
    expect(resolveLoyversePushMode('instant')).toBe('on_confirm')
  })
})

describe('resolveLoyverseConfig', () => {
  const readyTenant = {
    loyverse_enabled: true,
    loyverse_access_token: 'tok_123',
    loyverse_store_id: 'store_abc',
    loyverse_payment_type_id: 'pay_1',
    loyverse_push_mode: 'on_create',
  }

  it('reports disabled when the flag is off, even with credentials present', () => {
    expect(resolveLoyverseConfig({ ...readyTenant, loyverse_enabled: false })).toEqual({
      status: 'disabled',
    })
    expect(resolveLoyverseConfig({})).toEqual({ status: 'disabled' })
  })

  it('reports incomplete with the missing field names when enabled without credentials', () => {
    const result = resolveLoyverseConfig({ loyverse_enabled: true })
    expect(result.status).toBe('incomplete')
    if (result.status === 'incomplete') {
      expect(result.missing).toEqual(
        expect.arrayContaining(['loyverse_access_token', 'loyverse_store_id'])
      )
    }
  })

  it('treats blank-string credentials as missing', () => {
    const result = resolveLoyverseConfig({
      loyverse_enabled: true,
      loyverse_access_token: '  ',
      loyverse_store_id: '',
    })
    expect(result.status).toBe('incomplete')
  })

  it('returns a ready config when fully configured', () => {
    expect(resolveLoyverseConfig(readyTenant)).toEqual({
      status: 'ready',
      config: {
        accessToken: 'tok_123',
        storeId: 'store_abc',
        paymentTypeId: 'pay_1',
        pushMode: 'on_create',
      },
    })
  })

  it('does not require a payment type — receipts can be pushed unpaid', () => {
    const result = resolveLoyverseConfig({ ...readyTenant, loyverse_payment_type_id: null })
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.config.paymentTypeId).toBeNull()
    }
  })
})
