/**
 * What the merchant sees in an order's "Customer" panel.
 *
 * `customerData` is a carrier: alongside the details a merchant typed, it
 * ferries the internals every backend needs — the scheduled instant, the
 * delivery coordinates, the Messenger PSID, and (since pre-orders) the presell
 * claim id, date and line list. The panel renders whatever it finds as
 * `key: String(value)`, so an internal UUID reads as a mystery field and an
 * object-valued key renders literally as "[object Object]".
 *
 * The pre-order date already has its own amber banner above the panel, so the
 * three presell keys are pure noise there. And rather than grow the denylist
 * forever, anything that cannot render as a readable line is dropped: a
 * key/value row has no way to show an object.
 */

import { visibleCustomerFields } from '@/lib/admin/order-customer-fields'

describe('customer fields shown on an order', () => {
  it('keeps what the customer actually told the merchant', () => {
    // Arrange
    const data = { customer_name: 'Ana', Phone: '+639171234567', delivery_address: '12 Rizal St' }

    // Act
    const fields = visibleCustomerFields(data)

    // Assert
    expect(fields).toEqual([
      { key: 'customer_name', label: 'customer name', value: 'Ana' },
      { key: 'Phone', label: 'Phone', value: '+639171234567' },
      { key: 'delivery_address', label: 'delivery address', value: '12 Rizal St' },
    ])
  })

  it('drops the presell bookkeeping the pre-order banner already covers', () => {
    // Arrange: the claim id is an internal UUID and the date is on the banner.
    const data = {
      customer_name: 'Ana',
      presell_claim_id: 'c08339bc-8fad-4626-b341-ae5ecf493c1b',
      presell_date: '2026-09-18',
      presell_lines: [{ menu_item_id: 'x', quantity: 2 }],
    }

    // Act & Assert
    expect(visibleCustomerFields(data).map((f) => f.key)).toEqual(['customer_name'])
  })

  it('never renders a value that would read as "[object Object]"', () => {
    // Arrange: a key/value row cannot show an object, whatever the key is.
    const data = { customer_name: 'Ana', some_future_blob: { a: 1 }, a_list: [1, 2] }

    // Act & Assert
    expect(visibleCustomerFields(data).map((f) => f.key)).toEqual(['customer_name'])
  })

  it('still drops the carrier keys it always dropped', () => {
    // Arrange
    const data = {
      customer_name: 'Ana',
      scheduled_for: '2026-09-18T00:00:00.000Z',
      scheduled_for_label: 'Fri, Sep 18 · 8:00 AM',
      delivery_lat: '13.9',
      delivery_lng: '121.6',
      messenger_psid: '123',
      outlet_id: 'o1',
      outlet_name: 'Main',
    }

    // Act & Assert
    expect(visibleCustomerFields(data).map((f) => f.key)).toEqual(['customer_name'])
  })

  it('drops empty and missing values, and survives a non-object', () => {
    // Arrange & Assert
    expect(visibleCustomerFields({ a: '', b: null, c: undefined, d: 'keep' }).map((f) => f.key)).toEqual(['d'])
    expect(visibleCustomerFields(null)).toEqual([])
    expect(visibleCustomerFields('nonsense')).toEqual([])
  })

  it('renders numbers and booleans, which read fine on one line', () => {
    // Arrange & Assert
    expect(visibleCustomerFields({ sms_consent: false, table: 4 })).toEqual([
      { key: 'sms_consent', label: 'sms consent', value: 'false' },
      { key: 'table', label: 'table', value: '4' },
    ])
  })
})
