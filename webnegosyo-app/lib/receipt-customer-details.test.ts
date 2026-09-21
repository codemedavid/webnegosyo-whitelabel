import {
  parseReceiptLayout,
  renderReceipt,
  type ReceiptLayout,
} from "./receipt-layout";

/**
 * What the customer filled in at checkout, on paper.
 *
 * A merchant's checkout asks for whatever they configured — a delivery
 * address, a landmark, a floor, an email — and until now the receipt could
 * print none of it: the rider got a slip with no address on it. Two blocks
 * close that: `deliveryAddress` for the one field every delivery store needs
 * in a fixed spot, and `customerDetails` for everything else they asked for.
 *
 * Mirror of tests/unit/receipt-customer-details.test.ts on the web — the
 * renderer is hand-duplicated, so both suites pin the same output.
 */

const config = { storeName: 'Kape Co', width: 32 }

const order = {
  _id: 'abcdef1234567890',
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: 'Maria',
  customerContact: '09171234567',
  orderType: 'Delivery',
  total: 240,
  items: [{ menuItemName: 'Latte', quantity: 2, subtotal: 240 }],
  customerData: {
    delivery_address: '24 Rizal Street, Barangay San Jose, Quezon City 1100',
    landmark: 'Beside the blue gate',
    table_number: '12',
    // Carrier keys the customer never typed — never paper.
    outlet_id: '1b9f2c3d-0000-4444-8888-aaaaaaaaaaaa',
    delivery_lat: 14.65,
  },
}

function layoutOf(...blocks: ReceiptLayout['blocks']): ReceiptLayout {
  return { version: 1, theme: 'classic', blocks }
}

function linesOf(receipt: string): string[] {
  return receipt.split('\n')
}

describe('the deliveryAddress block', () => {
  it('prints the address the customer entered, under an editable label', () => {
    const receipt = renderReceipt(order, config, layoutOf({ kind: 'deliveryAddress' }))

    expect(receipt).toContain('Address: 24 Rizal Street,')
  })

  it('wraps a long address instead of clipping it off the paper', () => {
    const lines = linesOf(renderReceipt(order, config, layoutOf({ kind: 'deliveryAddress' })))

    // Every word survives, and nothing overflows the 32-column paper.
    expect(lines.map((line) => line.trim()).join(' ')).toContain('Quezon City 1100')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32)
  })

  it('takes a renamed label', () => {
    const receipt = renderReceipt(
      order,
      config,
      layoutOf({ kind: 'deliveryAddress', label: 'Deliver to' }),
    )

    expect(receipt).toContain('Deliver to: 24 Rizal Street,')
  })

  it('prints nothing at all when the order carries no address', () => {
    const receipt = renderReceipt(
      { ...order, customerData: { landmark: 'Blue gate' } },
      config,
      layoutOf({ kind: 'deliveryAddress' }),
    )

    expect(receipt).toBe('')
  })

  it('finds an address field the merchant named something else', () => {
    const receipt = renderReceipt(
      { ...order, customerData: { home_address: '9 Mabini St' } },
      config,
      layoutOf({ kind: 'deliveryAddress' }),
    )

    expect(receipt).toContain('Address: 9 Mabini St')
  })
})

describe('the customerDetails block', () => {
  it('prints every extra field the customer filled in', () => {
    const receipt = renderReceipt(order, config, layoutOf({ kind: 'customerDetails' }))

    expect(receipt).toContain('Delivery Address: 24 Rizal')
    expect(receipt).toContain('Landmark: Beside the blue gate')
  })

  it('never prints the platform carrier keys riding in the same blob', () => {
    const receipt = renderReceipt(order, config, layoutOf({ kind: 'customerDetails' }))

    expect(receipt).not.toContain('1b9f2c3d')
    expect(receipt).not.toContain('14.65')
  })

  it('prints nothing when the customer filled in nothing extra', () => {
    const receipt = renderReceipt(
      { ...order, customerData: {} },
      config,
      layoutOf({ kind: 'customerDetails' }),
    )

    expect(receipt).toBe('')
  })

  it('leaves the address to a deliveryAddress block that is already printing it', () => {
    const receipt = renderReceipt(
      order,
      config,
      layoutOf({ kind: 'deliveryAddress' }, { kind: 'customerDetails' }),
    )

    expect(receipt.match(/24 Rizal Street/g)).toHaveLength(1)
    // The rest still prints.
    expect(receipt).toContain('Landmark: Beside the blue gate')
  })

  it('leaves the table to the blocks that already print it', () => {
    const withMeta = renderReceipt(
      order,
      config,
      layoutOf({ kind: 'orderMeta' }, { kind: 'customerDetails' }),
    )

    // orderMeta already printed "Table: 12"; the catch-all stays off it.
    expect(withMeta).toContain('Table: 12')
    expect(withMeta).not.toContain('Table Number:')
  })

  it('prints the table when no other block does', () => {
    const receipt = renderReceipt(order, config, layoutOf({ kind: 'customerDetails' }))

    expect(receipt).toContain('Table Number: 12')
  })

  it('wraps a long answer under a hanging indent', () => {
    const receipt = renderReceipt(
      {
        ...order,
        customerData: {
          note: 'Please leave the order with the guard at the lobby and ring twice',
        },
      },
      config,
      layoutOf({ kind: 'customerDetails' }),
    )

    const lines = linesOf(receipt)
    expect(lines[0]).toBe('Note: Please leave the order')
    expect(lines[1]).toMatch(/^ {2}\S/)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32)
  })
})

describe('the modern theme', () => {
  it('centres the details the way it centres the rest of the header', () => {
    const receipt = renderReceipt(
      { ...order, customerData: { landmark: 'Blue gate' } },
      config,
      { version: 1, theme: 'modern', blocks: [{ kind: 'customerDetails' }] },
    )

    expect(receipt).toBe('      Landmark: Blue gate')
  })
})

describe('saved layouts', () => {
  it('accepts both blocks, with and without a renamed label', () => {
    const parsed = parseReceiptLayout({
      version: 1,
      blocks: [
        { kind: 'deliveryAddress', label: 'Deliver to' },
        { kind: 'customerDetails' },
      ],
    })

    expect(parsed).toEqual({
      version: 1,
      blocks: [
        { kind: 'deliveryAddress', label: 'Deliver to' },
        { kind: 'customerDetails' },
      ],
    })
  })

  it('refuses a label too long for the paper', () => {
    expect(
      parseReceiptLayout({
        version: 1,
        blocks: [{ kind: 'deliveryAddress', label: 'x'.repeat(33) }],
      }),
    ).toBeNull()
  })
})
