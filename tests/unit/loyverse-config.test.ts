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

  // Loyverse rejects every receipt that arrives without `payments`:
  //   MISSING_REQUIRED_PARAMETER "Field must be set" field=object.payments
  // A tenant left without a payment type is therefore not "ready to push
  // unpaid" — it is a tenant whose every push 400s forever, silently. Reporting
  // it as incomplete surfaces the gap on the superadmin card, which already has
  // a payment-type picker fed by the test-connection call.
  it('requires a payment type, because Loyverse rejects a receipt without one', () => {
    const result = resolveLoyverseConfig({ ...readyTenant, loyverse_payment_type_id: null })
    expect(result.status).toBe('incomplete')
    if (result.status === 'incomplete') {
      expect(result.missing).toEqual(['loyverse_payment_type_id'])
    }
  })

  it('treats a blank payment type as missing, like the other credentials', () => {
    const result = resolveLoyverseConfig({ ...readyTenant, loyverse_payment_type_id: '   ' })
    expect(result.status).toBe('incomplete')
  })
})
