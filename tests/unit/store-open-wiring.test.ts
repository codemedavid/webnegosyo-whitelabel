/**
 * Guardrail: the open/closed decision is only as good as the columns that reach
 * the page. `operating_hours`, `timezone`, and `enforce_operating_hours` missing
 * from a storefront projection resolves to `undefined` at runtime, which the
 * resolver (correctly) reads as "no hours configured" — i.e. the feature silently
 * does nothing after publish, exactly the failure mode that bit the mobile
 * branding overrides.
 *
 * Also pins the server-side order guard, which is the only enforcement a customer
 * cannot bypass by disabling JavaScript.
 */

import { describe, it, expect } from '@jest/globals'
import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'
import { PRODUCT_DETAIL_TENANT_SELECT } from '@/lib/queries/product-detail-tenant-select'
import {
  OPERATING_HOURS_ENFORCEMENT_COLUMNS,
  getClosedOrderError,
  type StoreHoursSource,
} from '@/lib/store-open-status'
import type { OperatingHours } from '@/lib/operating-hours'

function columnsOf(select: string): string[] {
  return select.split(',').map((c) => c.trim()).filter(Boolean)
}

const OPEN_WEEK: OperatingHours = {
  '0': { closed: false, open: '09:00', close: '21:00' },
  '1': { closed: false, open: '09:00', close: '21:00' },
  '2': { closed: false, open: '09:00', close: '21:00' },
  '3': { closed: false, open: '09:00', close: '21:00' },
  '4': { closed: false, open: '09:00', close: '21:00' },
  '5': { closed: false, open: '09:00', close: '21:00' },
  '6': { closed: false, open: '09:00', close: '21:00' },
}

function source(overrides: Partial<StoreHoursSource> = {}): StoreHoursSource {
  return {
    operating_hours: OPEN_WEEK,
    timezone: 'Asia/Manila',
    enforce_operating_hours: true,
    ...overrides,
  }
}

const MON_0900 = new Date('2026-07-20T01:00:00Z') // Monday 09:00 Manila
const MON_2300 = new Date('2026-07-20T15:00:00Z') // Monday 23:00 Manila

describe('operating-hours column wiring', () => {
  it.each([...OPERATING_HOURS_ENFORCEMENT_COLUMNS])(
    'selects %s on the storefront (menu) query',
    (column) => {
      expect(columnsOf(TENANT_STOREFRONT_SELECT)).toContain(column)
    },
  )

  it.each([...OPERATING_HOURS_ENFORCEMENT_COLUMNS])(
    'selects %s on the product detail query',
    (column) => {
      expect(columnsOf(PRODUCT_DETAIL_TENANT_SELECT)).toContain(column)
    },
  )
})

describe('getClosedOrderError (server-side guard)', () => {
  it('allows an order while the store is open', () => {
    expect(getClosedOrderError(source(), MON_0900)).toBeNull()
  })

  it('allows an order when the merchant has not opted into enforcement', () => {
    expect(getClosedOrderError(source({ enforce_operating_hours: false }), MON_2300)).toBeNull()
  })

  it('allows an order when hours were never configured', () => {
    expect(getClosedOrderError(source({ operating_hours: null }), MON_2300)).toBeNull()
  })

  it('rejects an order placed while the store is closed', () => {
    const error = getClosedOrderError(source(), MON_2300)
    expect(error).toMatch(/closed/i)
  })

  it('tells the customer when ordering reopens', () => {
    expect(getClosedOrderError(source(), MON_2300)).toContain('tomorrow at 9:00 AM')
  })
})
