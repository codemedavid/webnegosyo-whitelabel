import {
  CLASSIC_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  RECEIPT_STYLE_SUPPORT,
  defaultBlockStyle,
  flattenReceiptMarkup,
  parseReceiptLayout,
  renderReceipt,
  renderReceiptBlocks,
  renderReceiptSegments,
  stripReceiptMarkup,
  type ReceiptLayout,
} from './receipt-layout'

/**
 * Per-block text styling: a merchant can make any text block bigger, bold or
 * re-aligned, and turn on bold for the whole receipt (thermal heads print
 * faint). A block with no `style` renders exactly as before — Classic stays
 * byte-for-byte — and an app build that predates styles simply ignores them.
 *
 * Mirrored verbatim in tests/unit/receipt-block-style.test.ts (web).
 */

const order = {
  _id: 'abcdef1234567890',
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: 'Maria',
  customerContact: '09171234567',
  orderType: 'Dine-in',
  customerData: { table_number: '4' },
  total: 327.5,
  paymentMethod: 'Cash',
  items: [
    { menuItemName: 'Latte', quantity: 2, subtotal: 240, variation: 'Large' },
    { menuItemName: 'Croissant', quantity: 1, subtotal: 87.5 },
  ],
}

const config = { storeName: 'Kape Co', width: 32 }

function textOf(layout: ReceiptLayout): string {
  return renderReceiptSegments(order, config, layout)
    .map((segment) => (segment.type === 'text' ? segment.text : ''))
    .join('\n')
}

function linesOf(layout: ReceiptLayout): string[] {
  return textOf(layout).split('\n')
}

describe('parsing block styles', () => {
  it('keeps a valid style on a text block', () => {
    const parsed = parseReceiptLayout({
      version: 1,
      blocks: [{ kind: 'businessName', style: { size: 'large', bold: true, align: 'center' } }],
    })
    expect(parsed?.blocks[0]).toEqual({
      kind: 'businessName',
      style: { size: 'large', bold: true, align: 'center' },
    })
  })

  it('keeps a style alongside a renamed label', () => {
    const parsed = parseReceiptLayout({
      version: 1,
      blocks: [{ kind: 'orderNumber', label: 'Ref', style: { bold: false } }],
    })
    expect(parsed?.blocks[0]).toEqual({ kind: 'orderNumber', label: 'Ref', style: { bold: false } })
  })

  it.each([
    [{ size: 'huge' }],
    [{ bold: 'yes' }],
    [{ align: 'middle' }],
    ['large'],
  ])('rejects an invalid style %p', (style) => {
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: 'businessName', style }] }),
    ).toBeNull()
  })

  it('drops an empty style so the block keeps its unstyled rendering', () => {
    const parsed = parseReceiptLayout({ version: 1, blocks: [{ kind: 'businessName', style: {} }] })
    expect(parsed?.blocks[0]).toEqual({ kind: 'businessName' })
  })

  it('drops a style on a block that cannot be styled', () => {
    const parsed = parseReceiptLayout({
      version: 1,
      blocks: [{ kind: 'qr', style: { bold: true } }],
    })
    expect(parsed?.blocks[0]).toEqual({ kind: 'qr' })
  })

  it('parses the whole-receipt bold switch and rejects a non-boolean one', () => {
    expect(parseReceiptLayout({ version: 1, bold: true, blocks: [{ kind: 'feed' }] })?.bold).toBe(true)
    expect(parseReceiptLayout({ version: 1, bold: 'yes', blocks: [{ kind: 'feed' }] })).toBeNull()
  })
})

describe('styled rendering', () => {
  it('leaves Classic byte-for-byte when no block carries a style', () => {
    const plain = renderReceipt(order, config, CLASSIC_RECEIPT_LAYOUT)
    expect(plain).not.toMatch(/<\/?[CRBHW]>/)
  })

  it('prints a large bold business name on a Classic receipt', () => {
    const lines = linesOf({
      version: 1,
      theme: 'classic',
      blocks: [{ kind: 'businessName', style: { size: 'large', bold: true } }],
    })
    expect(lines).toEqual(['<C><W><B>KAPE CO</B></W></C>'])
  })

  it('merges a partial style over the theme default', () => {
    // Modern prints the name centred, bold and large; asking for normal size
    // keeps the other two.
    const lines = linesOf({
      version: 1,
      blocks: [{ kind: 'businessName', style: { size: 'normal' } }],
    })
    expect(lines).toEqual(['<C><B>KAPE CO</B></C>'])
  })

  it('makes a detail line bold and tall', () => {
    const lines = linesOf({
      version: 1,
      blocks: [{ kind: 'customerName', style: { size: 'tall', bold: true, align: 'left' } }],
    })
    expect(lines).toEqual(['<H><B>Customer: Maria</B></H>'])
  })

  it('wraps large text at half the paper width instead of clipping it', () => {
    const lines = linesOf({
      version: 1,
      blocks: [
        {
          kind: 'text',
          text: 'Thank you for dining with us today',
          align: 'center',
          style: { size: 'large' },
        },
      ],
    })
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.startsWith('<C><W>')).toBe(true)
      expect(stripReceiptMarkup(line).length).toBeLessThanOrEqual(16)
    }
    expect(lines.map(stripReceiptMarkup).join(' ')).toBe('Thank you for dining with us today')
  })

  it('reads a text block alignment from the block when the style names none', () => {
    const lines = linesOf({
      version: 1,
      theme: 'classic',
      blocks: [{ kind: 'text', text: 'Hello', align: 'right', style: { bold: true } }],
    })
    expect(lines).toEqual(['<R><B>Hello</B></R>'])
  })

  it('draws a large fill-in rule to half the paper width', () => {
    const [line] = linesOf({
      version: 1,
      blocks: [{ kind: 'fillIn', label: 'Name', style: { size: 'large' } }],
    })
    expect(stripReceiptMarkup(line!)).toHaveLength(16)
    expect(line).toMatch(/^<W>Name: _+<\/W>$/)
  })

  it('makes every item line tall and bold, keeping the columns', () => {
    const lines = linesOf({
      version: 1,
      blocks: [{ kind: 'items', style: { size: 'tall', bold: true } }],
    })
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines.filter((l) => l !== '')) {
      expect(line).toMatch(/^<H><B>.*<\/B><\/H>$/)
      expect(stripReceiptMarkup(line).length).toBeLessThanOrEqual(32)
    }
  })

  it('prints items no wider than tall even when asked for large', () => {
    const lines = linesOf({
      version: 1,
      blocks: [{ kind: 'items', style: { size: 'large' } }],
    })
    expect(lines.some((l) => l.includes('<W>'))).toBe(false)
    expect(lines.every((l) => l === '' || l.startsWith('<H>'))).toBe(true)
  })

  it('keeps silent blocks silent when styled', () => {
    const lines = renderReceiptSegments(order, config, {
      version: 1,
      blocks: [{ kind: 'storeAddress', style: { bold: true } }],
    })
    expect(lines).toEqual([])
  })
})

describe('bold for the whole receipt', () => {
  it('emboldens every printed line and keeps alignment tags first', () => {
    const layout: ReceiptLayout = { ...MODERN_RECEIPT_LAYOUT, bold: true }
    const lines = linesOf(layout).filter((l) => l !== '')
    for (const line of lines) expect(line).toContain('<B>')
    for (const line of lines.filter((l) => l.includes('<C>'))) {
      expect(line.startsWith('<C>')).toBe(true)
    }
  })

  it('still flattens centred lines to the paper shape', () => {
    const layout: ReceiptLayout = {
      version: 1,
      bold: true,
      blocks: [{ kind: 'text', text: 'Hi', align: 'center' }],
    }
    const [line] = linesOf(layout)
    expect(flattenReceiptMarkup(line!, 32)).toBe(`${' '.repeat(15)}Hi`)
  })
})

describe('renderReceiptBlocks', () => {
  it('returns one entry per block that adds up to the whole receipt', () => {
    const layout = MODERN_RECEIPT_LAYOUT
    const withQr = { ...config, trackingUrl: 'https://kape.co/t/A' }
    const perBlock = renderReceiptBlocks(order, withQr, layout)
    expect(perBlock.map((entry) => entry.index)).toEqual(layout.blocks.map((_, i) => i))

    const joined = perBlock
      .flatMap((entry) => entry.segments)
      .map((segment) => (segment.type === 'text' ? segment.text : `[${segment.type}]`))
      .join('\n')
    const whole = renderReceiptSegments(order, withQr, layout)
      .map((segment) => (segment.type === 'text' ? segment.text : `[${segment.type}]`))
      .join('\n')
    expect(joined).toBe(whole)
  })

  it('gives a block that prints nothing an empty segment list', () => {
    const perBlock = renderReceiptBlocks(order, config, {
      version: 1,
      blocks: [{ kind: 'storeAddress' }, { kind: 'businessName' }],
    })
    expect(perBlock[0]!.segments).toEqual([])
    expect(perBlock[1]!.segments).toHaveLength(1)
  })
})

describe('style support and defaults', () => {
  it('offers only normal and tall on the column blocks', () => {
    expect(RECEIPT_STYLE_SUPPORT.items).toEqual({ sizes: ['normal', 'tall'], align: false })
    expect(RECEIPT_STYLE_SUPPORT.totals).toEqual({ sizes: ['normal', 'tall'], align: false })
    expect(RECEIPT_STYLE_SUPPORT.qr).toBeUndefined()
    expect(RECEIPT_STYLE_SUPPORT.orderMeta).toBeUndefined()
  })

  it('describes what each theme prints by default', () => {
    expect(defaultBlockStyle('businessName', 'modern')).toEqual({
      size: 'large',
      bold: true,
      align: 'center',
    })
    expect(defaultBlockStyle('businessName', 'classic')).toEqual({
      size: 'normal',
      bold: false,
      align: 'center',
    })
    expect(defaultBlockStyle('orderNumber', 'modern')).toEqual({
      size: 'tall',
      bold: true,
      align: 'center',
    })
    expect(defaultBlockStyle('customerName', 'classic')).toEqual({
      size: 'normal',
      bold: false,
      align: 'left',
    })
  })

  it('reads a text block default alignment from the block', () => {
    expect(defaultBlockStyle({ kind: 'text', text: 'x', align: 'right' }, 'modern').align).toBe('right')
  })
})
