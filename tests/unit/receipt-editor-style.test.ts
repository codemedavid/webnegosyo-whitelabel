import {
  describeBlockStyle,
  duplicateDraft,
  insertDraftAfter,
  moveDraft,
  sanitizeLayoutForSave,
  setBlockStyle,
  splitOrderMetaDraft,
  type DraftBlock,
} from '@/lib/receipt-editor'
import type { ReceiptBlock } from '@/lib/receipt-layout'

/**
 * Receipt Studio helpers for styling and arranging blocks. Pure and
 * immutable, like the rest of the editor state.
 */

describe('setBlockStyle', () => {
  it('merges a style change into the block without touching the original', () => {
    const block: ReceiptBlock = { kind: 'businessName' }
    const next = setBlockStyle(block, { bold: true })
    expect(next).toEqual({ kind: 'businessName', style: { bold: true } })
    expect(block).toEqual({ kind: 'businessName' })

    expect(setBlockStyle(next, { size: 'large' })).toEqual({
      kind: 'businessName',
      style: { bold: true, size: 'large' },
    })
  })

  it('removes a field set to undefined and the whole style once it is empty', () => {
    const styled: ReceiptBlock = { kind: 'orderNumber', label: 'Ref', style: { bold: true } }
    expect(setBlockStyle(styled, { bold: undefined })).toEqual({ kind: 'orderNumber', label: 'Ref' })
  })

  it('keeps a text block alignment on the block, where older printers read it', () => {
    const text: ReceiptBlock = { kind: 'text', text: 'Hi', align: 'left' }
    expect(setBlockStyle(text, { align: 'center' })).toEqual({ kind: 'text', text: 'Hi', align: 'center' })
  })
})

describe('describeBlockStyle', () => {
  it('summarises only what the merchant changed', () => {
    expect(describeBlockStyle({ kind: 'businessName' })).toBeNull()
    expect(
      describeBlockStyle({ kind: 'businessName', style: { size: 'large', bold: true, align: 'right' } }),
    ).toBe('Large · Bold · Right')
    expect(describeBlockStyle({ kind: 'items', style: { bold: false } })).toBe('Regular weight')
  })
})

describe('arranging drafts', () => {
  const drafts: DraftBlock[] = [
    { id: 'a', block: { kind: 'businessName' } },
    { id: 'b', block: { kind: 'items' } },
  ]
  const feed: DraftBlock = { id: 'new', block: { kind: 'feed' } }
  const ids = (list: DraftBlock[]) => list.map((draft) => draft.id)

  it('inserts a new block right below the selected one', () => {
    expect(ids(insertDraftAfter(drafts, 'a', feed))).toEqual(['a', 'new', 'b'])
  })

  it('appends when nothing is selected', () => {
    expect(ids(insertDraftAfter(drafts, null, feed))).toEqual(['a', 'b', 'new'])
  })

  it('duplicates a block, style included, right below it', () => {
    const styled: DraftBlock[] = [{ id: 'a', block: { kind: 'text', text: 'Hi', style: { bold: true } } }]
    const next = duplicateDraft(styled, 'a', 'copy')
    expect(next.map((d) => d.block)).toEqual([styled[0]!.block, styled[0]!.block])
    expect(next[1]!.id).toBe('copy')
    expect(next[1]!.block).not.toBe(styled[0]!.block)
  })

  it('moves one place up or down and ignores moves off the ends', () => {
    expect(ids(moveDraft(drafts, 'b', -1))).toEqual(['b', 'a'])
    expect(ids(moveDraft(drafts, 'a', 1))).toEqual(['b', 'a'])
    expect(moveDraft(drafts, 'a', -1)).toBe(drafts)
    expect(moveDraft(drafts, 'b', 1)).toBe(drafts)
  })

  it('splits the all-in-one details block into lines a merchant can style', () => {
    let n = 0
    const next = splitOrderMetaDraft(
      [{ id: 'x', block: { kind: 'orderMeta' } }, ...drafts],
      'x',
      () => `part-${++n}`,
    )
    expect(next.map((d) => d.block.kind)).toEqual([
      'orderNumber',
      'orderDate',
      'customerName',
      'orderType',
      'tableNumber',
      'businessName',
      'items',
    ])
    expect(next[0]!.id).toBe('part-1')
  })
})

describe('saving styled layouts', () => {
  it('keeps block styles and the whole-receipt bold switch', () => {
    const layout = {
      version: 1,
      bold: true,
      blocks: [{ kind: 'businessName', style: { size: 'large' } }],
    }
    expect(sanitizeLayoutForSave(layout)).toEqual(layout)
  })
})
