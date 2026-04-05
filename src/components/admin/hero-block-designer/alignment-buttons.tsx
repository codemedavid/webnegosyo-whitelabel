'use client'

import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeStart,
  AlignVerticalDistributeCenter,
  AlignVerticalDistributeEnd,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// HorizontalAlignButtons — Left / Center / Right (+ optional Stretch)
// ---------------------------------------------------------------------------

type HorizontalAlignBase = 'left' | 'center' | 'right'
type HorizontalAlignWithStretch = HorizontalAlignBase | 'stretch'

interface HorizontalAlignBaseProps {
  value: HorizontalAlignBase
  onChange: (value: HorizontalAlignBase) => void
  includeStretch?: false
}

interface HorizontalAlignStretchProps {
  value: HorizontalAlignWithStretch
  onChange: (value: HorizontalAlignWithStretch) => void
  includeStretch: true
}

type HorizontalAlignButtonsProps =
  | HorizontalAlignBaseProps
  | HorizontalAlignStretchProps

const horizontalOptions: {
  value: HorizontalAlignWithStretch
  icon: typeof AlignLeft
  stretchOnly?: boolean
}[] = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
  { value: 'stretch', icon: AlignHorizontalDistributeCenter, stretchOnly: true },
]

export function HorizontalAlignButtons(props: HorizontalAlignButtonsProps) {
  const { value, onChange, includeStretch } = props

  return (
    <div className="flex gap-1">
      {horizontalOptions.map((opt) => {
        if (opt.stretchOnly && !includeStretch) return null
        const Icon = opt.icon
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => (onChange as (v: string) => void)(opt.value)}
            className={`rounded p-1.5 transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VerticalAlignButtons — Top / Middle / Bottom
// ---------------------------------------------------------------------------

interface VerticalAlignButtonsProps {
  value: 'top' | 'middle' | 'bottom'
  onChange: (value: 'top' | 'middle' | 'bottom') => void
}

const verticalOptions: {
  value: 'top' | 'middle' | 'bottom'
  icon: typeof AlignVerticalDistributeStart
}[] = [
  { value: 'top', icon: AlignVerticalDistributeStart },
  { value: 'middle', icon: AlignVerticalDistributeCenter },
  { value: 'bottom', icon: AlignVerticalDistributeEnd },
]

export function VerticalAlignButtons({ value, onChange }: VerticalAlignButtonsProps) {
  return (
    <div className="flex gap-1">
      {verticalOptions.map((opt) => {
        const Icon = opt.icon
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded p-1.5 transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}
