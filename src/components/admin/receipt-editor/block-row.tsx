'use client'

/**
 * One draggable block in the Receipt Studio stack. Renders the block's name
 * plus inline controls for everything editable on that kind: text + alignment,
 * divider style, and the merchant-renamable labels on the detail blocks.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import { BLOCK_PALETTE } from '@/lib/receipt-editor'
import type { ReceiptBlock, ReceiptBlockKind, ReceiptTextAlign } from '@/lib/receipt-layout'

/** Default printed label per renamable detail kind — placeholder text in the editor. */
export const DETAIL_LABEL_DEFAULTS: Partial<Record<ReceiptBlockKind, string>> = {
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

const TEXT_ALIGNS: { value: ReceiptTextAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

function blockMeta(kind: ReceiptBlockKind) {
  return BLOCK_PALETTE.find((entry) => entry.kind === kind)
}

const inputClass =
  'h-8 w-full rounded-lg border border-[#E5E0D6] bg-white px-2.5 text-[12.5px] font-semibold text-[#1D1815] outline-none placeholder:font-normal placeholder:text-[#B5AFA3] focus:border-[#1D1815]'

interface DraftBlock {
  id: string
  block: ReceiptBlock
}

type RenamableDetailBlock = Extract<
  ReceiptBlock,
  {
    kind:
      | 'orderNumber'
      | 'orderDate'
      | 'customerName'
      | 'orderType'
      | 'tableNumber'
      | 'deliveryAddress'
  }
>

function asRenamableDetail(block: ReceiptBlock): RenamableDetailBlock | null {
  if (
    block.kind === 'orderNumber' ||
    block.kind === 'orderDate' ||
    block.kind === 'customerName' ||
    block.kind === 'orderType' ||
    block.kind === 'tableNumber' ||
    block.kind === 'deliveryAddress'
  ) {
    return block
  }
  return null
}

interface DetailLabelInputProps {
  block: RenamableDetailBlock
  displayName: string
  onChange: (block: ReceiptBlock) => void
}

function DetailLabelInput({ block, displayName, onChange }: DetailLabelInputProps) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="flex-shrink-0 text-[11px] font-bold text-[#8B857B]">Label</span>
      <input
        value={block.label ?? ''}
        placeholder={DETAIL_LABEL_DEFAULTS[block.kind]}
        maxLength={32}
        aria-label={`${displayName} printed label`}
        onChange={(e) => {
          const value = e.target.value
          // No label saved = print the default; keeps stored layouts minimal.
          if (value === '') {
            onChange({ kind: block.kind })
          } else {
            onChange({ kind: block.kind, label: value })
          }
        }}
        className={inputClass}
      />
    </div>
  )
}

interface BlockRowProps {
  draft: DraftBlock
  onChange: (block: ReceiptBlock) => void
  onRemove: () => void
}

export function BlockRow({ draft, onChange, onRemove }: BlockRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draft.id,
  })
  const { block } = draft
  const meta = blockMeta(block.kind)
  const label = meta?.label ?? block.kind
  const renamableDetail = asRenamableDetail(block)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group rounded-[10px] border bg-white px-2.5 py-2 transition-shadow ${
        isDragging ? 'z-10 border-[#1D1815] shadow-lg' : 'border-[#E5E0D6]'
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none text-[#C9C3B7] hover:text-[#1D1815]"
          aria-label={`Drag ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex-1 truncate text-[12.5px] font-bold text-[#1D1815]">{label}</span>
        {block.kind === 'text' && (
          <span className="max-w-[110px] truncate text-[11px] text-[#8B857B]">
            &ldquo;{block.text}&rdquo;
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="rounded-md p-1 text-[#C9C3B7] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {block.kind === 'text' && (
        <div className="mt-2 flex gap-1.5">
          <input
            value={block.text}
            maxLength={64}
            aria-label="Custom text"
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className={inputClass}
          />
          <div className="flex flex-shrink-0 gap-0.5 rounded-lg bg-[#EFECE6] p-[3px]">
            {TEXT_ALIGNS.map((align) => (
              <button
                key={align.value}
                type="button"
                onClick={() => onChange({ ...block, align: align.value })}
                className={`rounded-md px-2 text-[10.5px] font-bold transition-colors ${
                  (block.align ?? 'left') === align.value
                    ? 'bg-white text-[#1D1815] shadow-sm'
                    : 'text-[#8B857B]'
                }`}
              >
                {align.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {block.kind === 'divider' && (
        <div className="mt-2 flex gap-1.5">
          {DIVIDER_STYLES.map((style) => (
            <button
              key={style.char}
              type="button"
              onClick={() => onChange({ ...block, char: style.char })}
              className={`flex-1 overflow-hidden whitespace-nowrap rounded-lg border px-1 py-1 font-mono text-[10px] transition-colors ${
                (block.char ?? '=') === style.char
                  ? 'border-[#1D1815] bg-[#1D1815] text-white'
                  : 'border-[#E5E0D6] text-[#8B857B] hover:border-[#1D1815]'
              }`}
            >
              {style.preview}
            </button>
          ))}
        </div>
      )}

      {renamableDetail && (
        <DetailLabelInput block={renamableDetail} displayName={label} onChange={onChange} />
      )}

      {block.kind === 'fillIn' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex-shrink-0 text-[11px] font-bold text-[#8B857B]">Label</span>
          <input
            value={block.label}
            placeholder="Name"
            maxLength={32}
            aria-label="Fill-in line label"
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            className={inputClass}
          />
        </div>
      )}
    </div>
  )
}
