/**
 * What an owner may ask to delete, validated before anything is read.
 *
 * The scope is the only steerable input on the deletion path, so every shape
 * that is not one of the three we offer must be refused here — an unknown kind
 * must never fall through to "everything".
 */
import {
  describeScope,
  parseDeletionRequest,
  rangeBounds,
} from '@/lib/order-deletion/scope'
import { MAX_SELECTED_ORDERS } from '@/lib/order-deletion/constants'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

describe('parseDeletionRequest', () => {
  test('accepts an inclusive date range', () => {
    const result = parseDeletionRequest({
      scope: { kind: 'range', from: '2026-09-01', to: '2026-09-15' },
    })

    expect(result).toEqual({
      ok: true,
      value: { scope: { kind: 'range', from: '2026-09-01', to: '2026-09-15' }, includeActive: false },
    })
  })

  test('accepts a single-day range', () => {
    const result = parseDeletionRequest({
      scope: { kind: 'range', from: '2026-09-01', to: '2026-09-01' },
    })
    expect(result.ok).toBe(true)
  })

  test('refuses a range whose end is before its start', () => {
    const result = parseDeletionRequest({
      scope: { kind: 'range', from: '2026-09-15', to: '2026-09-01' },
    })
    expect(result.ok).toBe(false)
  })

  test('refuses dates that are not real calendar days', () => {
    expect(parseDeletionRequest({ scope: { kind: 'range', from: '2026-02-30', to: '2026-03-01' } }).ok).toBe(false)
    expect(parseDeletionRequest({ scope: { kind: 'range', from: '2026-9-1', to: '2026-09-02' } }).ok).toBe(false)
  })

  test('accepts everything, and carries the include-active choice', () => {
    expect(parseDeletionRequest({ scope: { kind: 'all' }, includeActive: true })).toEqual({
      ok: true,
      value: { scope: { kind: 'all' }, includeActive: true },
    })
  })

  test('de-duplicates selected order ids', () => {
    const result = parseDeletionRequest({
      scope: { kind: 'selected', orderIds: [UUID_A, UUID_B, UUID_A] },
    })
    expect(result).toEqual({
      ok: true,
      value: { scope: { kind: 'selected', orderIds: [UUID_A, UUID_B] }, includeActive: false },
    })
  })

  test('refuses an empty selection', () => {
    expect(parseDeletionRequest({ scope: { kind: 'selected', orderIds: [] } }).ok).toBe(false)
  })

  test('refuses a selection that is not all uuids', () => {
    const result = parseDeletionRequest({
      scope: { kind: 'selected', orderIds: [UUID_A, "1' or '1'='1"] },
    })
    expect(result.ok).toBe(false)
  })

  test('refuses a selection above the cap', () => {
    const ids = Array.from({ length: MAX_SELECTED_ORDERS + 1 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    )
    expect(parseDeletionRequest({ scope: { kind: 'selected', orderIds: ids } }).ok).toBe(false)
  })

  test('refuses an unknown kind instead of widening it to everything', () => {
    expect(parseDeletionRequest({ scope: { kind: 'tenant', tenantId: UUID_A } }).ok).toBe(false)
    expect(parseDeletionRequest({ scope: undefined }).ok).toBe(false)
    expect(parseDeletionRequest(null).ok).toBe(false)
  })
})

describe('rangeBounds', () => {
  test('covers whole Manila days, end exclusive', () => {
    expect(rangeBounds('2026-09-01', '2026-09-15')).toEqual({
      startIso: '2026-08-31T16:00:00.000Z',
      endIso: '2026-09-15T16:00:00.000Z',
    })
  })
})

describe('describeScope', () => {
  test('names each scope in words an owner recognises', () => {
    expect(describeScope({ kind: 'all' })).toBe('All orders')
    expect(describeScope({ kind: 'range', from: '2026-09-01', to: '2026-09-15' })).toBe(
      'Orders from 2026-09-01 to 2026-09-15'
    )
    expect(describeScope({ kind: 'range', from: '2026-09-01', to: '2026-09-01' })).toBe(
      'Orders on 2026-09-01'
    )
    expect(describeScope({ kind: 'selected', orderIds: [UUID_A, UUID_B] })).toBe('2 selected orders')
    expect(describeScope({ kind: 'selected', orderIds: [UUID_A] })).toBe('1 selected order')
  })
})
