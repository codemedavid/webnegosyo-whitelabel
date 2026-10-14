'use client'

import { ChevronRight, PenLine } from 'lucide-react'
import { CAMPAIGN_PRESETS, type CampaignPreset } from '@/lib/texts/view/presets'
import { SheetFrame } from '../sheet-frame'

/** Step 0: "Start from". Choosing fills the name, who, message and schedule. */
export function ComposerChooser({ onPick, onClose }: { onPick: (preset: CampaignPreset | null) => void; onClose: () => void }) {
  return (
    <SheetFrame title="New campaign" description="Pick what you want to happen. You can change everything." onClose={onClose}>
      <ul className="space-y-2 p-4">
        {CAMPAIGN_PRESETS.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              onClick={() => onPick(preset)}
              className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{preset.title}</span>
                <span className="block text-sm text-muted-foreground">{preset.tagline}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-4 rounded-2xl border border-dashed p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PenLine className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1 font-semibold">Blank text</span>
          </button>
        </li>
      </ul>
    </SheetFrame>
  )
}
