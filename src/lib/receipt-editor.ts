import {
  parseReceiptLayout,
  type ReceiptBlock,
  type ReceiptBlockKind,
  type ReceiptBlockStyle,
  type ReceiptTextAlign,
  type ReceiptTextSize,
  type ReceiptLayout,
  type ReceiptPresetName,
} from '@/lib/receipt-layout'

/**
 * Receipt Studio state helpers — all immutable, all pure. The editor holds a
 * draft block stack in React state; everything that reaches the tenants row
 * goes through `sanitizeLayoutForSave` so the column can never hold a layout
 * the printer would refuse (it falls back to Modern on anything invalid, so
 * a bad save would silently discard the merchant's design).
 */

export const BLOCK_GROUPS = ['Header', 'Order details', 'Items & totals', 'Extras'] as const

export type BlockGroup = (typeof BLOCK_GROUPS)[number]

export interface BlockPaletteEntry {
  kind: ReceiptBlockKind
  label: string
  description: string
  group: BlockGroup
}

export const BLOCK_PALETTE: BlockPaletteEntry[] = [
  { kind: 'logo', label: 'Store logo', description: 'Your logo, printed at the top', group: 'Header' },
  { kind: 'businessName', label: 'Business name', description: 'Store name, centered and bold', group: 'Header' },
  { kind: 'storeAddress', label: 'Store address', description: 'Prints only when an address is set', group: 'Header' },
  { kind: 'text', label: 'Custom text', description: 'Subtitle, note, or any message', group: 'Header' },
  { kind: 'divider', label: 'Divider line', description: 'A full-width rule', group: 'Header' },
  { kind: 'orderMeta', label: 'All order details', description: 'Order #, date, customer, type in one block', group: 'Order details' },
  { kind: 'orderNumber', label: 'Order number', description: 'Just the order # — label is editable', group: 'Order details' },
  { kind: 'orderDate', label: 'Date & time', description: 'When the order was placed — label is editable', group: 'Order details' },
  { kind: 'customerName', label: 'Customer name', description: 'Who ordered — label is editable', group: 'Order details' },
  { kind: 'orderType', label: 'Order type', description: 'Dine-in / pickup / delivery, when set', group: 'Order details' },
  { kind: 'tableNumber', label: 'Table number', description: 'The table a dine-in customer entered, when set — label is editable', group: 'Order details' },
  { kind: 'contact', label: 'Customer contact', description: 'Phone/handle when the order has one', group: 'Order details' },
  { kind: 'deliveryAddress', label: 'Delivery address', description: 'The address the customer typed at checkout — label is editable', group: 'Order details' },
  { kind: 'customerDetails', label: 'Checkout answers', description: 'Every other detail they filled in — landmark, email, notes', group: 'Order details' },
  { kind: 'fillIn', label: 'Fill-in line', description: 'A label with a blank line to write on', group: 'Order details' },
  { kind: 'items', label: 'Items', description: 'Full item list with prices', group: 'Items & totals' },
  { kind: 'itemsSummary', label: 'Item count', description: 'Just "Items: N"', group: 'Items & totals' },
  { kind: 'totals', label: 'Totals', description: 'Subtotal, discounts, TOTAL, payment', group: 'Items & totals' },
  { kind: 'qr', label: 'Tracking QR', description: 'Scan to track the order live', group: 'Extras' },
  { kind: 'feed', label: 'Blank line', description: 'Vertical spacing', group: 'Extras' },
]

/** A new block of the given kind, seeded with editable defaults. */
function seedBlock(kind: ReceiptBlockKind): ReceiptBlock {
  if (kind === 'text') return { kind: 'text', text: 'Your note here', align: 'center' }
  if (kind === 'divider') return { kind: 'divider', char: '=' }
  if (kind === 'fillIn') return { kind: 'fillIn', label: 'Name' }
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

const PRESET_NAMES: readonly ReceiptPresetName[] = ['modern', 'classic', 'compact', 'detailed']

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

// ---------------------------------------------------------------------------
// Styling and arranging
// ---------------------------------------------------------------------------

/**
 * Merge a style change into a block. A field set to undefined goes back to
 * the theme default; a style left with no fields is removed, so an unstyled
 * block keeps its exact pre-styles rendering. A text block's alignment lives
 * on the block itself, where app builds that predate styles still read it.
 */
export function setBlockStyle(block: ReceiptBlock, patch: ReceiptBlockStyle): ReceiptBlock {
  if (block.kind === 'text' && 'align' in patch) {
    const { align, ...others } = patch
    return setBlockStyle({ ...block, align }, others)
  }
  const { style: current, ...rest } = block
  const merged: ReceiptBlockStyle = { ...current, ...patch }
  const style = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as ReceiptBlockStyle
  return (Object.keys(style).length > 0 ? { ...rest, style } : rest) as ReceiptBlock
}

const SIZE_LABELS: Record<ReceiptTextSize, string> = {
  normal: 'Normal size',
  tall: 'Tall',
  large: 'Large',
}

const ALIGN_LABELS: Record<ReceiptTextAlign, string> = {
  left: 'Left',
  center: 'Centered',
  right: 'Right',
}

/** "Large · Bold" — what the merchant changed on a block, or null. */
export function describeBlockStyle(block: ReceiptBlock): string | null {
  const style = block.style
  if (!style) return null
  const parts = [
    style.size ? SIZE_LABELS[style.size] : null,
    style.bold === undefined ? null : style.bold ? 'Bold' : 'Regular weight',
    style.align ? ALIGN_LABELS[style.align] : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** A block in the Studio's stack, with the id drag-and-drop and selection use. */
export interface DraftBlock {
  id: string
  block: ReceiptBlock
}

function draftIndex(drafts: DraftBlock[], id: string | null): number {
  return id === null ? -1 : drafts.findIndex((draft) => draft.id === id)
}

/** Insert below the draft `afterId`, or at the end when it is null or gone. */
export function insertDraftAfter(
  drafts: DraftBlock[],
  afterId: string | null,
  draft: DraftBlock,
): DraftBlock[] {
  const index = draftIndex(drafts, afterId)
  const at = index < 0 ? drafts.length : index + 1
  return [...drafts.slice(0, at), draft, ...drafts.slice(at)]
}

/** A deep copy of the draft `id`, style included, right below it. */
export function duplicateDraft(drafts: DraftBlock[], id: string, newId: string): DraftBlock[] {
  const index = draftIndex(drafts, id)
  if (index < 0) return drafts
  const copy = { id: newId, block: structuredClone(drafts[index]!.block) }
  return insertDraftAfter(drafts, id, copy)
}

/** Move the draft `id` one place up (-1) or down (1). */
export function moveDraft(drafts: DraftBlock[], id: string, offset: -1 | 1): DraftBlock[] {
  const index = draftIndex(drafts, id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= drafts.length) return drafts
  return drafts.map((draft, i) => {
    if (i === index) return drafts[target]!
    if (i === target) return drafts[index]!
    return draft
  })
}

/** The lines `orderMeta` prints, as blocks a merchant can style one by one. */
const ORDER_META_PARTS: ReceiptBlockKind[] = [
  'orderNumber',
  'orderDate',
  'customerName',
  'orderType',
  'tableNumber',
]

/** Replace an all-in-one details block with one block per line it prints. */
export function splitOrderMetaDraft(
  drafts: DraftBlock[],
  id: string,
  makeId: () => string,
): DraftBlock[] {
  const index = draftIndex(drafts, id)
  if (drafts[index]?.block.kind !== 'orderMeta') return drafts
  const parts = ORDER_META_PARTS.map((kind) => ({ id: makeId(), block: { kind } as ReceiptBlock }))
  return [...drafts.slice(0, index), ...parts, ...drafts.slice(index + 1)]
}
