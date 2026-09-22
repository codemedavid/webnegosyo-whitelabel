/**
 * The admin order-type form, as plain data.
 *
 * The configure screen builds its state from the server row and writes it back
 * clamped. Two properties have to hold or the screen misbehaves in ways that
 * look like data loss:
 *
 *  - Round-tripping is lossless. `buildOrderTypeFormState` → `toOrderTypeUpdateInput`
 *    must not quietly change a value the merchant never touched, because every
 *    save carries EVERY field: a lossy round trip reverts unrelated settings.
 *  - Every merchant-typed number reaches the server inside the range
 *    `orderTypeSchema` accepts, so a blank or out-of-range box produces a saved
 *    value rather than a Zod error the merchant cannot read.
 */

import {
  buildOrderTypeFormState,
  isOrderTypeFormDirty,
  orderTypeFormSignature,
  parseMarkupPercent,
  toOrderTypeUpdateInput,
} from '@/lib/order-types/order-type-form-state'
import { orderTypeSchema } from '@/lib/order-types-service'
import type { OrderType } from '@/types/database'

function makeOrderType(overrides: Partial<OrderType> = {}): OrderType {
  return {
    id: 'ot-1',
    tenant_id: 'tenant-1',
    type: 'delivery',
    name: 'Delivery',
    description: 'To your door',
    note: '',
    is_enabled: true,
    available_on_web: true,
    available_on_pos: true,
    pos_markup_percent: null,
    messenger_enabled: true,
    service_charge_enabled: false,
    service_charge_type: 'percentage',
    service_charge_value: 0,
    minimum_order_amount: 0,
    after_billing_payment_enabled: false,
    advance_order_enabled: false,
    advance_order_allow_asap: true,
    advance_order_lead_time_minutes: 30,
    advance_order_max_days_ahead: 7,
    advance_order_slot_interval_minutes: 30,
    order_index: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function roundTrip(overrides: Partial<OrderType> = {}) {
  const orderType = makeOrderType(overrides)
  return toOrderTypeUpdateInput(buildOrderTypeFormState(orderType), {
    type: orderType.type,
    order_index: orderType.order_index,
  })
}

describe('buildOrderTypeFormState — columns added after the row was saved', () => {
  it('reads an undefined availability column as "on"', () => {
    const state = buildOrderTypeFormState(
      makeOrderType({ available_on_web: undefined, available_on_pos: undefined } as Partial<OrderType>)
    )
    expect(state).toMatchObject({ available_on_web: true, available_on_pos: true })
  })

  it('reads an undefined pay-after-billing column as off', () => {
    const state = buildOrderTypeFormState(
      makeOrderType({ after_billing_payment_enabled: undefined })
    )
    expect(state.after_billing_payment_enabled).toBe(false)
  })

  it('keeps a null markup blank, not 0', () => {
    expect(buildOrderTypeFormState(makeOrderType({ pos_markup_percent: null })).pos_markup_percent)
      .toBe('')
  })
})

describe('parseMarkupPercent', () => {
  it('reads a blank box as "store price"', () => {
    expect(parseMarkupPercent('')).toBeNull()
    expect(parseMarkupPercent('   ')).toBeNull()
  })

  it('reads an unparseable box as "store price" rather than NaN', () => {
    expect(parseMarkupPercent('abc')).toBeNull()
  })

  it('clamps to the range the schema accepts', () => {
    expect(parseMarkupPercent('9999')).toBe(500)
    expect(parseMarkupPercent('-9999')).toBe(-100)
  })
})

describe('toOrderTypeUpdateInput — round trip', () => {
  it('does not change a setting the merchant never touched', () => {
    const payload = roundTrip({
      name: 'Delivery',
      note: 'Rider fee applies',
      available_on_web: false,
      pos_markup_percent: 25,
      service_charge_enabled: true,
      service_charge_value: 10,
      minimum_order_amount: 500,
      advance_order_enabled: true,
      advance_order_allow_asap: false,
      advance_order_lead_time_minutes: 120,
    })

    expect(payload).toMatchObject({
      name: 'Delivery',
      note: 'Rider fee applies',
      available_on_web: false,
      available_on_pos: true,
      pos_markup_percent: 25,
      service_charge_enabled: true,
      service_charge_value: 10,
      minimum_order_amount: 500,
      advance_order_enabled: true,
      advance_order_allow_asap: false,
      advance_order_lead_time_minutes: 120,
    })
  })

  it('carries the kind and position the row already had', () => {
    expect(roundTrip()).toMatchObject({ type: 'delivery', order_index: 2 })
  })

  it('produces a payload the write schema accepts', () => {
    expect(() => orderTypeSchema.parse(roundTrip())).not.toThrow()
  })
})

describe('toOrderTypeUpdateInput — clamping', () => {
  const state = () => buildOrderTypeFormState(makeOrderType())
  const write = (partial: Record<string, unknown>) =>
    toOrderTypeUpdateInput({ ...state(), ...partial } as ReturnType<typeof state>, {
      type: 'delivery',
      order_index: 0,
    })

  it('clamps a lead time past the schema ceiling', () => {
    expect(write({ advance_order_lead_time_minutes: 99999 })
      .advance_order_lead_time_minutes).toBe(10080)
  })

  it('clamps days ahead past the schema ceiling', () => {
    expect(write({ advance_order_max_days_ahead: 999 }).advance_order_max_days_ahead).toBe(60)
  })

  it('lifts a zeroed slot interval to the schema floor', () => {
    expect(write({ advance_order_slot_interval_minutes: 0 })
      .advance_order_slot_interval_minutes).toBe(5)
  })

  it('turns a cleared number box into 0, never NaN', () => {
    expect(write({ minimum_order_amount: NaN }).minimum_order_amount).toBe(0)
    expect(write({ service_charge_value: NaN }).service_charge_value).toBe(0)
  })

  it('refuses a negative minimum, matching the database check', () => {
    expect(write({ minimum_order_amount: -50 }).minimum_order_amount).toBe(0)
  })

  it('drops a blank description rather than saving an empty string', () => {
    expect(write({ description: '', note: '' })).toMatchObject({
      description: undefined,
      note: undefined,
    })
  })
})

describe('isOrderTypeFormDirty', () => {
  it('is clean for two builds of the same row', () => {
    const a = buildOrderTypeFormState(makeOrderType())
    const b = buildOrderTypeFormState(makeOrderType())
    expect(isOrderTypeFormDirty(a, b)).toBe(false)
    expect(orderTypeFormSignature(a)).toBe(orderTypeFormSignature(b))
  })

  it('notices a single changed field', () => {
    const saved = buildOrderTypeFormState(makeOrderType())
    expect(isOrderTypeFormDirty({ ...saved, name: 'Rider' }, saved)).toBe(true)
  })
})
