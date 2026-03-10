'use client'

import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
} from 'lucide-react'
import type { TextProps, ButtonProps, ElementProps } from '@/types/hero-designer'

type TypographyTarget = TextProps | ButtonProps

interface TypographySectionProps {
  props: TypographyTarget
  onUpdate: (props: Partial<ElementProps>) => void
}

const FONT_FAMILIES = [
  'Inter',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'system-ui',
]

const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

function ToggleButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

export function TypographySection({ props, onUpdate }: TypographySectionProps) {
  const isText = props.kind === 'text'
  const textProps = isText ? (props as TextProps) : null

  return (
    <div className="space-y-3">
      {/* Text Content - only for text */}
      {isText && textProps && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Content</span>
          <textarea
            value={textProps.content}
            onChange={(e) => onUpdate({ content: e.target.value } as Partial<ElementProps>)}
            rows={3}
            className="w-full resize-y rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            placeholder="Enter text content..."
          />
        </label>
      )}

      {/* Font Family - only for text */}
      {isText && textProps && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Font Family</span>
          <select
            value={textProps.fontFamily}
            onChange={(e) => onUpdate({ fontFamily: e.target.value } as Partial<ElementProps>)}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Font Size & Weight */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Font Size</span>
          <input
            type="number"
            value={props.fontSize}
            onChange={(e) => onUpdate({ fontSize: Number(e.target.value) } as Partial<ElementProps>)}
            min={1}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Font Weight</span>
          <select
            value={props.fontWeight}
            onChange={(e) => onUpdate({ fontWeight: Number(e.target.value) } as Partial<ElementProps>)}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          >
            {FONT_WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Line Height & Letter Spacing - only for text */}
      {isText && textProps && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Line Height</span>
            <input
              type="number"
              value={textProps.lineHeight}
              onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) } as Partial<ElementProps>)}
              min={0.5}
              max={5}
              step={0.1}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Letter Spacing</span>
            <input
              type="number"
              value={textProps.letterSpacing}
              onChange={(e) => onUpdate({ letterSpacing: Number(e.target.value) } as Partial<ElementProps>)}
              min={-10}
              max={50}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </label>
        </div>
      )}

      {/* Text Align - only for text */}
      {isText && textProps && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-400">Text Align</span>
          <div className="flex gap-1">
            {([
              { value: 'left' as const, icon: AlignLeft, label: 'Left' },
              { value: 'center' as const, icon: AlignCenter, label: 'Center' },
              { value: 'right' as const, icon: AlignRight, label: 'Right' },
            ]).map(({ value, icon: Icon, label }) => (
              <ToggleButton
                key={value}
                active={textProps.textAlign === value}
                onClick={() => onUpdate({ textAlign: value } as Partial<ElementProps>)}
                title={label}
              >
                <Icon size={14} />
              </ToggleButton>
            ))}
          </div>
        </div>
      )}

      {/* Color */}
      {isText && textProps && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={textProps.color}
              onChange={(e) => onUpdate({ color: e.target.value } as Partial<ElementProps>)}
              className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <input
              type="text"
              value={textProps.color}
              onChange={(e) => onUpdate({ color: e.target.value } as Partial<ElementProps>)}
              className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </div>
        </label>
      )}

      {/* Text Shadow - only for text */}
      {isText && textProps && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Text Shadow</span>
          <input
            type="text"
            value={textProps.textShadow}
            onChange={(e) => onUpdate({ textShadow: e.target.value } as Partial<ElementProps>)}
            placeholder="e.g. 2px 2px 4px rgba(0,0,0,0.5)"
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        </label>
      )}

      {/* Bold / Italic / Underline - only for text */}
      {isText && textProps && (
        <div className="space-y-1">
          <span className="text-xs text-zinc-400">Style</span>
          <div className="flex gap-1">
            <ToggleButton
              active={textProps.bold}
              onClick={() => onUpdate({ bold: !textProps.bold } as Partial<ElementProps>)}
              title="Bold"
            >
              <Bold size={14} />
            </ToggleButton>
            <ToggleButton
              active={textProps.italic}
              onClick={() => onUpdate({ italic: !textProps.italic } as Partial<ElementProps>)}
              title="Italic"
            >
              <Italic size={14} />
            </ToggleButton>
            <ToggleButton
              active={textProps.underline}
              onClick={() => onUpdate({ underline: !textProps.underline } as Partial<ElementProps>)}
              title="Underline"
            >
              <Underline size={14} />
            </ToggleButton>
          </div>
        </div>
      )}
    </div>
  )
}
