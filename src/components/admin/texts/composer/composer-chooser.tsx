'use client'

import { PenLine } from 'lucide-react'
import { CAMPAIGN_PRESETS, type CampaignPreset } from '@/lib/texts/view/presets'
import { PresetCard } from '../campaigns/preset-card'
import { SheetFrame } from '../sheet-frame'

/** Step 0: "Start from". Choosing fills the name, who, message and schedule. */
export function ComposerChooser({ onPick, onClose }: { onPick: (preset: CampaignPreset | null) => void; onClose: () => void }) {
  return (
    <SheetFrame title="New campaign" description="Pick what you want to happen. You can change everything." onClose={onClose}>
      <ul className="space-y-3 bg-wn-sand/60 p-4 sm:p-5">
        {CAMPAIGN_PRESETS.map((preset) => (
          <li key={preset.id}><PresetCard preset={preset} layout="row" onPick={() => onPick(preset)} /></li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-stone-300 p-4 text-left transition-colors hover:border-stone-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-wn-stone ring-1 ring-wn-line" aria-hidden="true"><PenLine className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block font-semibold">Blank text</span>
              <span className="block text-sm text-wn-stone">Start from nothing</span>
            </span>
          </button>
        </li>
      </ul>
    </SheetFrame>
  )
}
