import {
  addBlock,
  BLOCK_GROUPS,
  BLOCK_PALETTE,
  moveBlock,
  removeBlock,
  sanitizeLayoutForSave,
  updateBlock,
} from '@/lib/receipt-editor'
import { CLASSIC_RECEIPT_LAYOUT } from '@/lib/receipt-layout'

/**
 * Receipt Studio state helpers. All immutable — the editor keeps drafts in
 * React state — and everything that reaches the tenants row goes through
 * sanitizeLayoutForSave, so the column can never hold a layout the printer
 * would refuse.
 */

const blocks = CLASSIC_RECEIPT_LAYOUT.blocks

describe('block list editing (immutable)', () => {
  it('adds a palette block at the end without touching the original', () => {
    const next = addBlock(blocks, 'contact')
    expect(next).toHaveLength(blocks.length + 1)
    expect(next[next.length - 1]).toEqual({ kind: 'contact' })
    expect(blocks).toHaveLength(CLASSIC_RECEIPT_LAYOUT.blocks.length)
  })

  it('seeds a text block with editable defaults', () => {
    const next = addBlock([], 'text')
    expect(next[0]).toEqual({ kind: 'text', text: 'Your note here', align: 'center' })
  })

  it('removes and reorders by index', () => {
    expect(removeBlock(blocks, 0)).toHaveLength(blocks.length - 1)
    const moved = moveBlock(blocks, 1, 0)
    expect(moved[0]).toEqual(blocks[1])
    expect(moved[1]).toEqual(blocks[0])
  })

  it('ignores out-of-range moves', () => {
    expect(moveBlock(blocks, 0, -1)).toEqual(blocks)
    expect(moveBlock(blocks, 99, 0)).toEqual(blocks)
  })

  it('updates a block in place immutably', () => {
    const next = updateBlock(
      [{ kind: 'text', text: 'old', align: 'left' }],
      0,
      { kind: 'text', text: 'new', align: 'right' },
    )
    expect(next[0]).toEqual({ kind: 'text', text: 'new', align: 'right' })
  })
})

describe('BLOCK_PALETTE', () => {
  it('offers every block kind exactly once, with a label', () => {
    const kinds = BLOCK_PALETTE.map((entry) => entry.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    for (const entry of BLOCK_PALETTE) {
      expect(entry.label.length).toBeGreaterThan(0)
    }
    expect(kinds).toEqual(
      expect.arrayContaining(['businessName', 'text', 'items', 'totals', 'qr', 'contact']),
    )
  })

  it('offers the granular order-detail blocks', () => {
    const kinds = BLOCK_PALETTE.map((entry) => entry.kind)
    expect(kinds).toEqual(
      expect.arrayContaining([
        'orderNumber',
        'orderDate',
        'customerName',
        'orderType',
        'fillIn',
      ]),
    )
  })

  it('assigns every entry to a known palette group', () => {
    for (const entry of BLOCK_PALETTE) {
      expect(BLOCK_GROUPS).toContain(entry.group)
    }
    // Every group has at least one block, so the editor never shows an empty group.
    for (const group of BLOCK_GROUPS) {
      expect(BLOCK_PALETTE.some((entry) => entry.group === group)).toBe(true)
    }
  })

  it('offers a logo block in the Header group', () => {
    const logo = BLOCK_PALETTE.find((entry) => entry.kind === 'logo')
    expect(logo).toBeDefined()
    expect(logo?.group).toBe('Header')
  })

  it('seeds a fill-in block with an editable label', () => {
    expect(addBlock([], 'fillIn')[0]).toEqual({ kind: 'fillIn', label: 'Name' })
  })
})

describe('sanitizeLayoutForSave', () => {
  it('passes preset names straight through', () => {
    expect(sanitizeLayoutForSave('modern')).toBe('modern')
    expect(sanitizeLayoutForSave('classic')).toBe('classic')
    expect(sanitizeLayoutForSave('compact')).toBe('compact')
    expect(sanitizeLayoutForSave('detailed')).toBe('detailed')
  })

  it('keeps the style a custom layout was designed with', () => {
    const saved = sanitizeLayoutForSave({
      version: 1,
      theme: 'classic',
      blocks: [{ kind: 'businessName' }, { kind: 'totals' }],
    })
    expect(typeof saved === 'object' && saved?.theme).toBe('classic')
  })

  it('accepts a valid custom layout and returns it normalized', () => {
    const saved = sanitizeLayoutForSave({
      version: 1,
      blocks: [{ kind: 'businessName' }, { kind: 'items' }, { kind: 'totals' }],
    })
    expect(saved).toEqual({
      version: 1,
      blocks: [{ kind: 'businessName' }, { kind: 'items' }, { kind: 'totals' }],
    })
  })

  it('rejects unknown presets, invalid layouts, and empty stacks', () => {
    expect(sanitizeLayoutForSave('fancy')).toBeNull()
    expect(sanitizeLayoutForSave({ version: 1, blocks: [] })).toBeNull()
    expect(sanitizeLayoutForSave({ version: 1, blocks: [{ kind: 'boom' }] })).toBeNull()
    expect(sanitizeLayoutForSave(42)).toBeNull()
  })
})

describe('table number block in the studio', () => {
  it('is offered under Order details', () => {
    const entry = BLOCK_PALETTE.find((e) => e.kind === 'tableNumber')
    expect(entry?.group).toBe('Order details')
    expect(entry?.label).toMatch(/table/i)
  })

  it('seeds as a plain block a merchant can relabel', () => {
    expect(addBlock([], 'tableNumber')).toEqual([{ kind: 'tableNumber' }])
  })
})

describe('checkout answers in the studio', () => {
  it('offers the address and catch-all blocks under Order details', () => {
    for (const kind of ['deliveryAddress', 'customerDetails'] as const) {
      const entry = BLOCK_PALETTE.find((e) => e.kind === kind)
      expect(entry?.group).toBe('Order details')
      expect(entry?.description.length).toBeGreaterThan(0)
    }
  })

  it('names the address block so a merchant looking for "address" finds it', () => {
    expect(BLOCK_PALETTE.find((e) => e.kind === 'deliveryAddress')?.label).toMatch(/address/i)
  })

  it('seeds both as plain blocks — the address label is editable later', () => {
    expect(addBlock([], 'deliveryAddress')).toEqual([{ kind: 'deliveryAddress' }])
    expect(addBlock([], 'customerDetails')).toEqual([{ kind: 'customerDetails' }])
  })

  it('saves a layout that prints them', () => {
    expect(
      sanitizeLayoutForSave({
        version: 1,
        blocks: [{ kind: 'deliveryAddress', label: 'Deliver to' }, { kind: 'customerDetails' }],
      }),
    ).toEqual({
      version: 1,
      blocks: [{ kind: 'deliveryAddress', label: 'Deliver to' }, { kind: 'customerDetails' }],
    })
  })
})
