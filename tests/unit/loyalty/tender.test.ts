import { validateTender, type FrozenPaymentPolicy } from '@/lib/loyalty/tender'

const policy: FrozenPaymentPolicy = {
  totalCentavos: 12500,
  allowedMethods: [
    { id: 'cash', kind: 'cash', requiresReference: false },
    { id: 'gcash', kind: 'manual', requiresReference: true },
    { id: 'bank', kind: 'manual', requiresReference: false },
  ],
}

describe('validateTender', () => {
  it('rejects unsupported policy requirements instead of treating proof as a reference', () => {
    const tender = { methodId: 'bank', amountTenderedCentavos: 12500 }
    expect(validateTender({ ...policy, requiresProviderVerification: true }, tender))
      .toEqual({ ok: false, error: 'invalid_policy' })
    expect(validateTender({ ...policy, allowedMethods: [{
      id: 'bank', kind: 'manual', requiresReference: false, requiresPaymentProof: true,
    }] }, tender)).toEqual({ ok: false, error: 'invalid_policy' })
  })
  it.each([0, Number.MAX_SAFE_INTEGER])('accepts cash at safe boundary %p for a zero-total quote', amountTenderedCentavos => {
    expect(validateTender({ ...policy, totalCentavos: 0 }, { methodId: 'cash', amountTenderedCentavos }))
      .toEqual({ ok: true, value: {
        methodId: 'cash', kind: 'cash', amountTenderedCentavos, changeCentavos: amountTenderedCentavos, reference: null,
      } })
  })

  it('accepts an optional empty manual reference and the 128-character normalized boundary', () => {
    for (const reference of [undefined, null, '', '   ', `  ${'a'.repeat(128)}  `]) {
      expect(validateTender(policy, { methodId: 'bank', amountTenderedCentavos: 12500, reference }))
        .toEqual({ ok: true, value: {
          methodId: 'bank', kind: 'manual', amountTenderedCentavos: 12500, changeCentavos: 0,
          reference: reference?.trim() || null,
        } })
    }
  })

  it('does not mutate the frozen policy or tender', () => {
    const frozenPolicy = Object.freeze({ ...policy, allowedMethods: Object.freeze(policy.allowedMethods.map(method => Object.freeze({ ...method }))) })
    const tender = Object.freeze({ methodId: 'gcash', amountTenderedCentavos: 12500, reference: '  txn-123  ' })
    expect(validateTender(frozenPolicy, tender).ok).toBe(true)
    expect(tender.reference).toBe('  txn-123  ')
  })
  it('rejects inherited tender fields and hidden secret fields', () => {
    const valid = { methodId: 'cash', amountTenderedCentavos: 12500 }
    expect(validateTender(policy, Object.create(valid))).toEqual({ ok: false, error: 'invalid_tender' })
    expect(validateTender(policy, Object.defineProperty({ ...valid }, 'cvv', { value: '123' })))
      .toEqual({ ok: false, error: 'invalid_tender' })
    expect(validateTender(policy, { ...valid, [Symbol('secret')]: '123' }))
      .toEqual({ ok: false, error: 'invalid_tender' })
  })
  it.each([123, {}, [], 'a'.repeat(129), '\ntxn', 'txn\t', 'tx\u0000n', 'txn\u007f', 'txn\u0085']) (
    'rejects malformed, overlong, or control-containing reference: %p', reference => {
      expect(validateTender(policy, { methodId: 'bank', amountTenderedCentavos: 12500, reference }))
        .toEqual({ ok: false, error: 'invalid_reference' })
    },
  )
  it.each([undefined, null, '', '   '])('enforces frozen reference requirement: %p', reference => {
    expect(validateTender(policy, { methodId: 'gcash', amountTenderedCentavos: 12500, reference }))
      .toEqual({ ok: false, error: 'reference_required' })
  })
  it('records a trimmed manual reference as cashier attestation', () => {
    expect(validateTender(policy, { methodId: 'gcash', amountTenderedCentavos: 12500, reference: '  txn-123  ' }))
      .toEqual({ ok: true, value: {
        methodId: 'gcash', kind: 'manual', amountTenderedCentavos: 12500, changeCentavos: 0, reference: 'txn-123',
      } })
  })
  it.each([12499, 12501])('requires manual tender to match the frozen total exactly: %p', amountTenderedCentavos => {
    expect(validateTender(policy, { methodId: 'gcash', amountTenderedCentavos, reference: 'receipt-1' }))
      .toEqual({ ok: false, error: 'manual_amount_mismatch' })
  })
  it('rejects cash that does not cover the frozen total', () => {
    expect(validateTender(policy, { methodId: 'cash', amountTenderedCentavos: 12499 }))
      .toEqual({ ok: false, error: 'insufficient_cash' })
  })
  it.each([undefined, null, '15000', -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects malformed or unsafe centavos: %p', amountTenderedCentavos => {
      expect(validateTender(policy, { methodId: 'cash', amountTenderedCentavos }))
        .toEqual({ ok: false, error: 'invalid_amount' })
    },
  )
  it('rejects methods absent from the frozen policy', () => {
    expect(validateTender(policy, { methodId: 'card', amountTenderedCentavos: 12500 }))
      .toEqual({ ok: false, error: 'unknown_method' })
  })
  it.each([null, undefined, [], 12, {}, { methodId: 1, amountTenderedCentavos: 15000 },
    ...['cardNumber', 'cvv', 'totalCentavos', 'kind', 'changeCentavos', 'proof'].map(key => ({
      methodId: 'cash', amountTenderedCentavos: 15000, [key]: 'untrusted',
    })),
  ])('rejects malformed tender and undeclared fields %#', tender => {
    expect(validateTender(policy, tender)).toEqual({ ok: false, error: 'invalid_tender' })
  })
  it.each([undefined, null, [], {}, { ...policy, totalCentavos: -1 },
    { ...policy, totalCentavos: 1.5 }, { ...policy, totalCentavos: Number.MAX_SAFE_INTEGER + 1 },
    { ...policy, totalCentavos: NaN }, { ...policy, totalCentavos: Infinity },
    { ...policy, totalCentavos: '12500' }, { ...policy, allowedMethods: [] },
    { ...policy, allowedMethods: [null] },
    { ...policy, allowedMethods: [{ id: 'cash', kind: 'provider', requiresReference: false }] },
    { ...policy, allowedMethods: [{ id: '', kind: 'cash', requiresReference: false }] },
    { ...policy, allowedMethods: [{ id: ' cash ', kind: 'cash', requiresReference: false }] },
    { ...policy, allowedMethods: [{ id: 'cash', kind: 'cash', requiresReference: 'false' }] },
    { ...policy, allowedMethods: [policy.allowedMethods[0], policy.allowedMethods[0]] },
  ])('fails closed for malformed frozen policy %#', invalidPolicy => {
    expect(validateTender(invalidPolicy, { methodId: 'cash', amountTenderedCentavos: 15000 }))
      .toEqual({ ok: false, error: 'invalid_policy' })
  })
  it('calculates cash change from the server-frozen total', () => {
    expect(validateTender(policy, { methodId: 'cash', amountTenderedCentavos: 15000 })).toEqual({
      ok: true,
      value: { methodId: 'cash', kind: 'cash', amountTenderedCentavos: 15000, changeCentavos: 2500, reference: null },
    })
  })
})
