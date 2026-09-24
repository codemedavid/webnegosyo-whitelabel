'use client'

/**
 * Text style controls for one receipt block: size, bold and alignment. Shows
 * what the block prints like right now — the merchant's style merged over the
 * theme default — and offers only what the block kind supports (item and
 * total columns cannot go double width, a fill-in rule has nothing to align).
 */

import { AlignCenter, AlignLeft, AlignRight, Bold, RotateCcw } from 'lucide-react'
import { setBlockStyle } from '@/lib/receipt-editor'
import {
  RECEIPT_STYLE_SUPPORT,
  defaultBlockStyle,
  type ReceiptBlock,
  type ReceiptTextAlign,
  type ReceiptTextSize,
  type ReceiptTheme,
} from '@/lib/receipt-layout'

const SIZE_OPTIONS: Record<ReceiptTextSize, { label: string; glyphClass: string }> = {
  normal: { label: 'Normal', glyphClass: 'text-[12px]' },
  tall: { label: 'Tall', glyphClass: 'inline-block scale-y-[1.8] text-[12px]' },
  large: { label: 'Large', glyphClass: 'text-[19px] leading-none' },
}

const ALIGN_OPTIONS: { value: ReceiptTextAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Align left', Icon: AlignLeft },
  { value: 'center', label: 'Align center', Icon: AlignCenter },
  { value: 'right', label: 'Align right', Icon: AlignRight },
]

/** A text block keeps its alignment on the block itself, so reset leaves it. */
const RESET_PATCH = {
  text: { size: undefined, bold: undefined },
  other: { size: undefined, bold: undefined, align: undefined },
} as const

const segmentButton = (isActive: boolean) =>
  `flex items-center justify-center rounded-md transition-colors ${
    isActive ? 'bg-white text-[#1D1815] shadow-sm' : 'text-[#8B857B] hover:text-[#1D1815]'
  }`

interface BlockStyleControlsProps {
  block: ReceiptBlock
  theme: ReceiptTheme
  /** Paper columns, to say how much fits on a large line. */
  columns: number
  onChange: (block: ReceiptBlock) => void
}

export function BlockStyleControls({ block, theme, columns, onChange }: BlockStyleControlsProps) {
  const support = RECEIPT_STYLE_SUPPORT[block.kind]
  if (!support) return null

  const defaults = defaultBlockStyle(block, theme)
  const size = block.style?.size ?? defaults.size
  const isBold = block.style?.bold ?? defaults.bold
  const align = block.kind === 'text' ? (block.align ?? 'left') : (block.style?.align ?? defaults.align)
  const hasCustomStyle = block.style !== undefined

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-bold text-[#8B857B]">Text size</span>
          {size === 'large' && (
            <span className="text-[10.5px] text-[#8B857B]">
              Fits {Math.floor(columns / 2)} letters per line
            </span>
          )}
        </div>
        <div className="grid gap-0.5 rounded-lg bg-[#EFECE6] p-[3px]" style={{ gridTemplateColumns: `repeat(${support.sizes.length}, 1fr)` }} role="radiogroup" aria-label="Text size">
          {support.sizes.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={size === option}
              onClick={() => onChange(setBlockStyle(block, { size: option }))}
              className={`${segmentButton(size === option)} h-11 flex-col gap-0.5`}
            >
              <span className={`font-serif font-bold ${SIZE_OPTIONS[option].glyphClass}`}>Aa</span>
              <span className="text-[10px] font-bold">{SIZE_OPTIONS[option].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isBold}
          onClick={() => onChange(setBlockStyle(block, { bold: !isBold }))}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold transition-colors ${
            isBold
              ? 'border-[#1D1815] bg-[#1D1815] text-white'
              : 'border-[#E5E0D6] text-[#8B857B] hover:border-[#1D1815] hover:text-[#1D1815]'
          }`}
        >
          <Bold className="h-3.5 w-3.5" />
          Bold
        </button>

        {support.align && (
          <div className="flex gap-0.5 rounded-lg bg-[#EFECE6] p-[3px]" role="radiogroup" aria-label="Alignment">
            {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={align === value}
                aria-label={label}
                title={label}
                onClick={() => onChange(setBlockStyle(block, { align: value }))}
                className={`${segmentButton(align === value)} h-[26px] w-8`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />
        {hasCustomStyle && (
          <button
            type="button"
            onClick={() => onChange(setBlockStyle(block, RESET_PATCH[block.kind === 'text' ? 'text' : 'other']))}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-[#8B857B] hover:bg-[#EFECE6] hover:text-[#1D1815]"
            title="Back to how this template prints it"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
