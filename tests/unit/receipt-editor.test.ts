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

  it('seeds a fill-in block with an editable label', () => {
    expect(addBlock([], 'fillIn')[0]).toEqual({ kind: 'fillIn', label: 'Name' })
  })
})

describe('sanitizeLayoutForSave', () => {
  it('passes preset names straight through', () => {
    expect(sanitizeLayoutForSave('classic')).toBe('classic')
    expect(sanitizeLayoutForSave('compact')).toBe('compact')
    expect(sanitizeLayoutForSave('detailed')).toBe('detailed')
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
