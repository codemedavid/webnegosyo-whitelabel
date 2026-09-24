'use client'

/**
 * One draggable block in the Receipt Studio stack. Collapsed it shows the
 * block's name and what the merchant changed; selected, it opens an inspector
 * with the block's content (text, label, divider style), its text style, and
 * the arrange actions (move, duplicate, delete).
 */

import { useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, GripVertical, Scissors, Trash2 } from 'lucide-react'
import { BLOCK_PALETTE, describeBlockStyle, type DraftBlock } from '@/lib/receipt-editor'
import {
  RECEIPT_STYLE_SUPPORT,
  type ReceiptBlock,
  type ReceiptBlockKind,
  type ReceiptTheme,
} from '@/lib/receipt-layout'
import { BlockStyleControls } from './block-style-controls'
import { scrollIntoPane } from './scroll-into-pane'

/** Default printed label per renamable detail kind — placeholder text in the editor. */
const DETAIL_LABEL_DEFAULTS: Partial<Record<ReceiptBlockKind, string>> = {
  orderNumber: 'Order #',
  orderDate: 'Date',
  customerName: 'Customer',
  orderType: 'Type',
  tableNumber: 'Table',
  deliveryAddress: 'Address',
}

const DIVIDER_STYLES = [
  { char: '=', preview: '════════' },
  { char: '-', preview: '────────' },
  { char: '*', preview: '********' },
  { char: '.', preview: '. . . . . . ' },
]

/** What the inspector says about blocks that have no text style. */
const UNSTYLED_NOTES: Partial<Record<ReceiptBlockKind, string>> = {
  logo: 'Prints your store logo from Settings, in black and white.',
  qr: 'Prints a code customers scan to follow their order live.',
  feed: 'Adds one blank line of space.',
  divider: 'Pick the character the line is drawn with.',
  orderMeta: 'Prints order #, date, customer, type and table together.',
}

const inputClass =
  'h-8 w-full rounded-lg border border-[#E5E0D6] bg-white px-2.5 text-[12.5px] font-semibold text-[#1D1815] outline-none placeholder:font-normal placeholder:text-[#B5AFA3] focus:border-[#1D1815]'

const sectionLabel = 'mb-1 block text-[11px] font-bold text-[#8B857B]'

export function blockLabel(kind: ReceiptBlockKind): string {
  return BLOCK_PALETTE.find((entry) => entry.kind === kind)?.label ?? kind
}

function hasLabel(block: ReceiptBlock): block is Extract<ReceiptBlock, { label?: string }> {
  return block.kind in DETAIL_LABEL_DEFAULTS
}

/** Content edits for one block: its text, label or divider character. */
function BlockContentFields({
  block,
  onChange,
}: {
  block: ReceiptBlock
  onChange: (block: ReceiptBlock) => void
}) {
  if (block.kind === 'text') {
    return (
      <label className="block">
        <span className={sectionLabel}>Text</span>
        <input
          value={block.text}
          maxLength={64}
          aria-label="Custom text"
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          className={inputClass}
        />
      </label>
    )
  }
  if (block.kind === 'fillIn') {
    return (
      <label className="block">
        <span className={sectionLabel}>Label</span>
        <input
          value={block.label}
          placeholder="Name"
          maxLength={32}
          aria-label="Fill-in line label"
          onChange={(e) => onChange({ ...block, label: e.target.value })}
          className={inputClass}
        />
      </label>
    )
  }
  if (hasLabel(block)) {
    return (
      <label className="block">
        <span className={sectionLabel}>Printed label</span>
        <input
          value={block.label ?? ''}
          placeholder={DETAIL_LABEL_DEFAULTS[block.kind]}
          maxLength={32}
          aria-label={`${blockLabel(block.kind)} printed label`}
          // No label saved = print the default; keeps stored layouts minimal.
          onChange={(e) => onChange({ ...block, label: e.target.value || undefined })}
          className={inputClass}
        />
      </label>
    )
  }
  if (block.kind === 'divider') {
    return (
      <div className="flex gap-1.5">
        {DIVIDER_STYLES.map((style) => (
          <button
            key={style.char}
            type="button"
            aria-pressed={(block.char ?? '=') === style.char}
            onClick={() => onChange({ ...block, char: style.char })}
            className={`flex-1 overflow-hidden whitespace-nowrap rounded-lg border px-1 py-1.5 font-mono text-[10px] transition-colors ${
              (block.char ?? '=') === style.char
                ? 'border-[#1D1815] bg-[#1D1815] text-white'
                : 'border-[#E5E0D6] text-[#8B857B] hover:border-[#1D1815]'
            }`}
          >
            {style.preview}
          </button>
        ))}
      </div>
    )
  }
  return null
}

const iconButton =
  'flex h-7 w-7 items-center justify-center rounded-md text-[#8B857B] transition-colors hover:bg-[#EFECE6] hover:text-[#1D1815] disabled:opacity-30 disabled:hover:bg-transparent'

interface BlockRowProps {
  draft: DraftBlock
  theme: ReceiptTheme
  columns: number
  isSelected: boolean
  isFirst: boolean
  isLast: boolean
  /** The block prints nothing on the sample sale. */
  isSilent: boolean
  hasLogo: boolean
  onSelect: () => void
  onChange: (block: ReceiptBlock) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (offset: -1 | 1) => void
  onSplit: () => void
}

export function BlockRow({
  draft,
  theme,
  columns,
  isSelected,
  isFirst,
  isLast,
  isSilent,
  hasLogo,
  onSelect,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  onSplit,
}: BlockRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draft.id,
  })
  const rowRef = useRef<HTMLDivElement | null>(null)
  const { block } = draft
  const label = blockLabel(block.kind)
  const styleSummary = describeBlockStyle(block)
  const summary = block.kind === 'text' ? `“${block.text}”` : styleSummary
  const note = UNSTYLED_NOTES[block.kind]
  const isStylable = RECEIPT_STYLE_SUPPORT[block.kind] !== undefined

  // Keep the row in view when it was picked by clicking the paper.
  useEffect(() => {
    if (isSelected) scrollIntoPane(rowRef.current)
  }, [isSelected])

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        rowRef.current = node
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group rounded-[10px] border bg-white transition-shadow ${
        isDragging
          ? 'z-10 border-[#1D1815] shadow-lg'
          : isSelected
            ? 'border-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.15)]'
            : 'border-[#E5E0D6] hover:border-[#CFC8BA]'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="cursor-grab touch-none p-0.5 text-[#C9C3B7] hover:text-[#1D1815]"
          aria-label={`Drag ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={isSelected}
          className="flex min-w-0 flex-1 items-baseline gap-2 py-0.5 text-left"
        >
          <span className="flex-shrink-0 text-[12.5px] font-bold text-[#1D1815]">{label}</span>
          {summary && <span className="truncate text-[11px] text-[#8B857B]">{summary}</span>}
          {isSilent && !summary && (
            <span className="truncate text-[11px] italic text-[#B5AFA3]">not on sample</span>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className={`${iconButton} opacity-0 hover:!bg-red-50 hover:!text-red-600 focus-visible:opacity-100 group-hover:opacity-100 ${
            isSelected ? 'opacity-100' : ''
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isSelected && (
        <div className="flex flex-col gap-3 border-t border-[#EFECE6] px-3 pb-3 pt-2.5">
          <BlockContentFields block={block} onChange={onChange} />

          {isStylable && (
            <BlockStyleControls block={block} theme={theme} columns={columns} onChange={onChange} />
          )}

          {note && <p className="text-[11.5px] leading-snug text-[#8B857B]">{note}</p>}

          {block.kind === 'logo' && !hasLogo && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-800">
              Your store has no logo yet, so this prints nothing. Upload one in Settings first.
            </p>
          )}

          {block.kind === 'orderMeta' && (
            <button
              type="button"
              onClick={onSplit}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#E5E0D6] px-3 py-2 text-[12px] font-bold text-[#1D1815] hover:border-[#1D1815]"
            >
              <Scissors className="h-3.5 w-3.5" />
              Split into separate lines to style each one
            </button>
          )}

          <div className="-mb-1 flex items-center gap-0.5 border-t border-[#EFECE6] pt-2">
            <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up" title="Move up" className={iconButton}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down" title="Move down" className={iconButton}>
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onDuplicate} aria-label="Duplicate" title="Duplicate" className={iconButton}>
              <Copy className="h-3.5 w-3.5" />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onRemove}
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-bold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
