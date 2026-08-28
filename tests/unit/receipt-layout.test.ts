import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  parseReceiptLayout,
  renderReceipt,
  resolveReceiptLayout,
} from '@/lib/receipt-layout'

/**
 * Web-side mirror of webnegosyo-app/lib/receipt-layout.ts (deliberate
 * duplication, like qr-order-codec). The admin's receipt editor previews with
 * this renderer, so what it shows must be what the app prints. These tests pin
 * the same guarantees as the app-side suite.
 */

const baseOrder = {
  _id: 'abcdef1234567890',
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: 'Walk-in',
  customerContact: 'n/a',
  total: 327.5,
  items: [
    { menuItemName: 'Latte', quantity: 2, subtotal: 240 },
    { menuItemName: 'Croissant', quantity: 1, subtotal: 87.5 },
  ],
}

const config = { storeName: 'Kape Co', width: 32 }

function linesOf(receipt: string): string[] {
  return receipt.split('\n')
}

describe('renderReceipt (web mirror) — Classic preset', () => {
  it('prints the historic receipt shape', () => {
    const receipt = renderReceipt(baseOrder, config, CLASSIC_RECEIPT_LAYOUT)
    const lines = linesOf(receipt)
    expect(lines[0]).toBe('='.repeat(32))
    expect(receipt).toContain('KAPE CO')
    expect(receipt).toContain('Order #: 34567890')
    expect(receipt).toContain('Latte')
    expect(lines.find((l) => l.startsWith('TOTAL:'))).toContain('P327.50')
    expect(receipt).toContain('Thank you!')
  })

  it('keeps every line within the paper width', () => {
    for (const l of linesOf(renderReceipt(baseOrder, config, CLASSIC_RECEIPT_LAYOUT))) {
      expect(l.length).toBeLessThanOrEqual(32)
    }
  })

  it('prints a discounted sale with subtotal and discount lines', () => {
    const discounted = {
      ...baseOrder,
      total: 300,
      customerData: {
        discount: {
          total: 27.5,
          deliveryDiscount: 0,
          lines: [{ label: 'WELCOME10', amount: 27.5, code: 'WELCOME10' }],
          allocationsByLine: {},
        },
      },
    }
    const receipt = renderReceipt(discounted, config, CLASSIC_RECEIPT_LAYOUT)
    expect(receipt).toContain('WELCOME10')
    expect(receipt).toContain('-P27.50')
    expect(linesOf(receipt).find((l) => l.startsWith('Subtotal:'))).toContain('P327.50')
  })
})

describe('custom layouts (web mirror)', () => {
  it('renders blocks in layout order with aligned text', () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      blocks: [
        { kind: 'text', text: 'Salamat po!', align: 'center' },
        { kind: 'businessName' },
        { kind: 'itemsSummary' },
        { kind: 'qr' },
      ],
    })
    const lines = linesOf(receipt)
    expect(lines[0]).toContain('Salamat po!')
    expect(lines[1]).toContain('KAPE CO')
    expect(lines[2]).toBe('Items: 3')
    expect(lines).toHaveLength(3) // qr silent without trackingUrl
  })

  it('prints the tracking link when the config carries one', () => {
    const receipt = renderReceipt(
      baseOrder,
      { ...config, trackingUrl: 'https://kape.co/t/ABC' },
      { version: 1, blocks: [{ kind: 'qr' }] },
    )
    expect(receipt).toContain('Scan to track your order')
    expect(receipt).toContain('https://kape.co/t/ABC')
  })
})

describe('order detail blocks (web mirror)', () => {
  const detailOrder = { ...baseOrder, customerName: 'Maria', orderType: 'Dine-in' }

  it('prints each order detail as its own block with default labels', () => {
    const receipt = renderReceipt(detailOrder, config, {
      version: 1,
      blocks: [
        { kind: 'orderNumber' },
        { kind: 'orderDate' },
        { kind: 'customerName' },
        { kind: 'orderType' },
      ],
    })
    const lines = linesOf(receipt)
    expect(lines[0]).toBe('Order #: 34567890')
    expect(lines[1]).toMatch(/^Date: /)
    expect(lines[2]).toBe('Customer: Maria')
    expect(lines[3]).toBe('Type: Dine-in')
  })

  it('prints merchant-authored labels instead of the defaults', () => {
    const receipt = renderReceipt(detailOrder, config, {
      version: 1,
      blocks: [
        { kind: 'orderNumber', label: 'Ref' },
        { kind: 'customerName', label: 'Guest' },
      ],
    })
    const lines = linesOf(receipt)
    expect(lines[0]).toBe('Ref: 34567890')
    expect(lines[1]).toBe('Guest: Maria')
  })

  it('stays silent for orderType when the order has none', () => {
    const receipt = renderReceipt(detailOrder, config, {
      version: 1,
      blocks: [{ kind: 'orderType' }, { kind: 'text', text: 'after' }],
    })
    expect(linesOf(receipt)[1]).toBe('Type: Dine-in')
    const noType = renderReceipt({ ...detailOrder, orderType: undefined }, config, {
      version: 1,
      blocks: [{ kind: 'orderType' }, { kind: 'text', text: 'after' }],
    })
    expect(linesOf(noType)).toEqual(['after'])
  })

  it('stacked in the classic order, the granular blocks match orderMeta line-for-line', () => {
    const granular = renderReceipt(detailOrder, config, {
      version: 1,
      blocks: [
        { kind: 'orderNumber' },
        { kind: 'orderDate' },
        { kind: 'customerName' },
        { kind: 'orderType' },
      ],
    })
    const composite = renderReceipt(detailOrder, config, {
      version: 1,
      blocks: [{ kind: 'orderMeta' }],
    })
    expect(granular).toBe(composite)
  })

  it('renders a fill-in line as a label plus a writable rule to the paper edge', () => {
    const receipt = renderReceipt(detailOrder, config, {
      version: 1,
      blocks: [{ kind: 'fillIn', label: 'Received by' }],
    })
    const [line] = linesOf(receipt)
    expect(line).toHaveLength(32)
    expect(line.startsWith('Received by: ')).toBe(true)
    expect(line.endsWith('___')).toBe(true)
  })

  it('clips an over-long fill-in label to the paper width', () => {
    const receipt = renderReceipt(detailOrder, config, {
      version: 1,
      blocks: [{ kind: 'fillIn', label: 'X'.repeat(40) }],
    })
    expect(linesOf(receipt)[0]).toHaveLength(32)
  })

  it('parses the detail blocks and rejects malformed ones', () => {
    expect(
      parseReceiptLayout({
        version: 1,
        blocks: [
          { kind: 'orderNumber' },
          { kind: 'orderDate', label: 'Printed' },
          { kind: 'customerName' },
          { kind: 'orderType' },
          { kind: 'fillIn', label: 'Name' },
        ],
      }),
    ).not.toBeNull()
    // fillIn is a writable line — a label is what the customer fills in.
    expect(parseReceiptLayout({ version: 1, blocks: [{ kind: 'fillIn' }] })).toBeNull()
    expect(parseReceiptLayout({ version: 1, blocks: [{ kind: 'fillIn', label: '' }] })).toBeNull()
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: 'orderNumber', label: 42 }] }),
    ).toBeNull()
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: 'orderDate', label: 'Y'.repeat(33) }] }),
    ).toBeNull()
  })
})

describe('layout validation (web mirror)', () => {
  it('accepts valid layouts and rejects invalid ones', () => {
    expect(parseReceiptLayout({ version: 1, blocks: [{ kind: 'items' }] })).not.toBeNull()
    expect(parseReceiptLayout(null)).toBeNull()
    expect(parseReceiptLayout({ version: 1, blocks: [] })).toBeNull()
    expect(parseReceiptLayout({ version: 1, blocks: [{ kind: 'nope' }] })).toBeNull()
  })

  it('resolves preset names and falls back to Classic', () => {
    expect(resolveReceiptLayout('compact')).toBe(COMPACT_RECEIPT_LAYOUT)
    expect(resolveReceiptLayout('detailed')).toBe(DETAILED_RECEIPT_LAYOUT)
    expect(resolveReceiptLayout(undefined)).toBe(CLASSIC_RECEIPT_LAYOUT)
    expect(resolveReceiptLayout({ bad: true })).toBe(CLASSIC_RECEIPT_LAYOUT)
  })
})
