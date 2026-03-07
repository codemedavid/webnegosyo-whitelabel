'use client'

import { Play } from 'lucide-react'
import type { ElementAnimation, AnimationType } from '@/types/hero-designer'

interface AnimationSectionProps {
  animation: ElementAnimation
  onUpdate: (animation: Partial<ElementAnimation>) => void
  onPreview?: () => void
}

const ANIMATION_TYPES: { value: AnimationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fadeIn', label: 'Fade In' },
  { value: 'slideUp', label: 'Slide Up' },
  { value: 'slideDown', label: 'Slide Down' },
  { value: 'slideLeft', label: 'Slide Left' },
  { value: 'slideRight', label: 'Slide Right' },
  { value: 'scaleIn', label: 'Scale In' },
  { value: 'bounce', label: 'Bounce' },
]

export function AnimationSection({ animation, onUpdate, onPreview }: AnimationSectionProps) {
  return (
    <div className="space-y-3">
      {/* Type */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Type</span>
        <select
          value={animation.type}
          onChange={(e) => onUpdate({ type: e.target.value as AnimationType })}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
        >
          {ANIMATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {/* Duration */}
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Duration</span>
          <span className="text-xs text-zinc-500">{animation.duration}ms</span>
        </div>
        <input
          type="range"
          min={0}
          max={5000}
          step={100}
          value={animation.duration}
          onChange={(e) => onUpdate({ duration: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </label>

      {/* Delay */}
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Delay</span>
          <span className="text-xs text-zinc-500">{animation.delay}ms</span>
        </div>
        <input
          type="range"
          min={0}
          max={10000}
          step={100}
          value={animation.delay}
          onChange={(e) => onUpdate({ delay: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </label>

      {/* Preview */}
      {animation.type !== 'none' && (
        <button
          type="button"
          onClick={onPreview}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
        >
          <Play size={12} />
          Preview animation
        </button>
      )}
    </div>
  )
}
