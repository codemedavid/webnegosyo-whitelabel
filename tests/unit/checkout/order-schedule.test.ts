/**
 * The advance-order time a checkout asks for is re-validated against the order
 * type's own schedule, and customer_data is kept in lockstep with what is
 * persisted — never an ASAP column beside a "scheduled" label.
 */

import { describe, test, expect, jest } from '@jest/globals'
import { resolveOrderSchedule } from '@/lib/checkout/order-schedule'
import type { CheckoutOrderTypeRow } from '@/lib/checkout/checkout-order-type'

const NOW = new Date('2026-10-03T02:00:00.000Z')

const schedulingType: CheckoutOrderTypeRow = {
  name: 'Pickup',
  advance_order_enabled: true,
  advance_order_allow_asap: true,
  advance_order_lead_time_minutes: 30,
  advance_order_max_days_ahead: 3,
  advance_order_slot_interval_minutes: 15,
} as CheckoutOrderTypeRow

const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

describe('resolveOrderSchedule', () => {
  test('keeps an in-policy time and stamps it (with a cleaned label) into customer data', () => {
    // Act
    const result = resolveOrderSchedule({
      scheduledForISO: inHours(2),
      orderTypeId: 'ot-1',
      orderTypeRow: schedulingType,
      items: [],
      customerData: { name: 'Ana', scheduled_for_label: '  Today\n4 PM ' },
      now: NOW,
    })

    // Assert
    expect(result.scheduledISO).toBe(inHours(2))
    expect(result.customerData).toEqual({ name: 'Ana', scheduled_for: inHours(2), scheduled_for_label: 'Today 4 PM' })
  })

  test('drops an out-of-policy time and strips any schedule the client stashed', () => {
    // Arrange
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const customerData = { name: 'Ana', scheduled_for: 'x', scheduled_for_label: 'Next year' }

    // Act
    const result = resolveOrderSchedule({
      scheduledForISO: inHours(24 * 30),
      orderTypeId: 'ot-1',
      orderTypeRow: schedulingType,
      items: [],
      customerData,
      now: NOW,
    })

    // Assert
    expect(result.scheduledISO).toBeUndefined()
    expect(result.customerData).toEqual({ name: 'Ana' })
    expect(customerData).toHaveProperty('scheduled_for') // the input is never mutated
    warn.mockRestore()
  })

  test('ignores a time when the order type does not schedule', () => {
    // Act
    const result = resolveOrderSchedule({
      scheduledForISO: inHours(2),
      orderTypeId: 'ot-1',
      orderTypeRow: { ...schedulingType, advance_order_enabled: false } as CheckoutOrderTypeRow,
      items: [],
      customerData: undefined,
      now: NOW,
    })

    // Assert
    expect(result).toEqual({ scheduledISO: undefined, customerData: undefined })
  })

  test('returns the very same customer data when nothing needs reconciling', () => {
    // Arrange
    const customerData = { name: 'Ana' }

    // Act
    const result = resolveOrderSchedule({
      scheduledForISO: undefined,
      orderTypeId: undefined,
      orderTypeRow: null,
      items: [],
      customerData,
      now: NOW,
    })

    // Assert
    expect(result.customerData).toBe(customerData)
  })

  test('ignores an unparseable time', () => {
    // Act
    const result = resolveOrderSchedule({
      scheduledForISO: 'not-a-date',
      orderTypeId: 'ot-1',
      orderTypeRow: schedulingType,
      items: [],
      customerData: { name: 'Ana' },
      now: NOW,
    })

    // Assert
    expect(result.scheduledISO).toBeUndefined()
  })
})
