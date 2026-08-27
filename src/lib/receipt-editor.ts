import {
  parseReceiptLayout,
  type ReceiptBlock,
  type ReceiptBlockKind,
  type ReceiptLayout,
  type ReceiptPresetName,
} from '@/lib/receipt-layout'

/**
 * Receipt Studio state helpers — all immutable, all pure. The editor holds a
 * draft block stack in React state; everything that reaches the tenants row
 * goes through `sanitizeLayoutForSave` so the column can never hold a layout
 * the printer would refuse (it falls back to Classic on anything invalid, so
 * a bad save would silently discard the merchant's design).
 */

export interface BlockPaletteEntry {
  kind: ReceiptBlockKind
  label: string
  description: string
}

export const BLOCK_PALETTE: BlockPaletteEntry[] = [
  { kind: 'businessName', label: 'Business name', description: 'Store name, centered and bold' },
  { kind: 'storeAddress', label: 'Store address', description: 'Prints only when an address is set' },
  { kind: 'text', label: 'Custom text', description: 'Subtitle, note, or any message' },
  { kind: 'divider', label: 'Divider line', description: 'A full-width rule' },
  { kind: 'orderMeta', label: 'Order details', description: 'Order #, date, customer, type' },
  { kind: 'contact', label: 'Customer contact', description: 'Phone/handle when the order has one' },
  { kind: 'items', label: 'Items', description: 'Full item list with prices' },
  { kind: 'itemsSummary', label: 'Item count', description: 'Just "Items: N"' },
  { kind: 'totals', label: 'Totals', description: 'Subtotal, discounts, TOTAL, payment' },
  { kind: 'qr', label: 'Tracking QR', description: 'Scan to track the order live' },
  { kind: 'feed', label: 'Blank line', description: 'Vertical spacing' },
]

/** A new block of the given kind, seeded with editable defaults. */
function seedBlock(kind: ReceiptBlockKind): ReceiptBlock {
  if (kind === 'text') return { kind: 'text', text: 'Your note here', align: 'center' }
  if (kind === 'divider') return { kind: 'divider', char: '=' }
  return { kind } as ReceiptBlock
}

export function addBlock(blocks: ReceiptBlock[], kind: ReceiptBlockKind): ReceiptBlock[] {
  return [...blocks, seedBlock(kind)]
}

export function removeBlock(blocks: ReceiptBlock[], index: number): ReceiptBlock[] {
  return blocks.filter((_, i) => i !== index)
}

export function moveBlock(blocks: ReceiptBlock[], from: number, to: number): ReceiptBlock[] {
  if (from < 0 || from >= blocks.length || to < 0 || to >= blocks.length) return blocks
  const next = [...blocks]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

export function updateBlock(
  blocks: ReceiptBlock[],
  index: number,
  block: ReceiptBlock,
): ReceiptBlock[] {
  return blocks.map((existing, i) => (i === index ? block : existing))
}

const PRESET_NAMES: readonly ReceiptPresetName[] = ['classic', 'compact', 'detailed']

/**
 * What the save action is allowed to write: a known preset name or a layout
 * that parses. Null means refuse the save — never store something the
 * renderer would silently replace with Classic.
 */
export function sanitizeLayoutForSave(value: unknown): ReceiptPresetName | ReceiptLayout | null {
  if (typeof value === 'string') {
    return PRESET_NAMES.includes(value as ReceiptPresetName)
      ? (value as ReceiptPresetName)
      : null
  }
  return parseReceiptLayout(value)
}
