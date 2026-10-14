'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { CAMPAIGN_PRESETS } from '@/lib/texts/view/presets'
import { useTexts } from '../texts-context'
import { PresetCard } from './preset-card'

/** No campaigns yet: the presets, ready to change. */
export function CampaignEmpty() {
  const { setUrl, live } = useTexts()
  // The owl appears once per screen: the no-phone hero already has it.
  const showOwl = live.sender.heroState !== 'none'
  return (
    <section className="space-y-6 rounded-3xl border border-wn-line bg-gradient-to-b from-white to-wn-sand/60 p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        {showOwl && <Image src="/assistant/owl-96.webp" alt="" width={56} height={56} className="mb-4 h-14 w-14 rounded-2xl ring-1 ring-wn-line" />}
        <h2 className="text-xl font-semibold tracking-tight">Send your first campaign</h2>
        <p className="mt-1.5 max-w-md text-sm text-wn-stone">Text a group of your guests from your own phone. Pick one to start, change anything.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAMPAIGN_PRESETS.map((preset) => (
          <li key={preset.id} className="flex flex-col gap-2">
            <PresetCard preset={preset} onPick={() => setUrl({ campaign: 'new', preset: preset.id })} />
            {preset.automaticTwin && (
              <button
                type="button"
                className="min-h-11 rounded-lg px-1 text-left text-xs text-wn-stone hover:text-foreground sm:min-h-0"
                onClick={() => setUrl({ automatic: preset.automaticTwin?.recipe ?? null })}
              >
                Want this every day, on its own? Turn on <span className="font-semibold text-foreground underline-offset-2 hover:underline">{preset.automaticTwin.title}</span> in Automatic.
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="text-center">
        <Button type="button" variant="ghost" className="min-h-11 rounded-full text-wn-stone" onClick={() => setUrl({ campaign: 'new', preset: null })}>
          Start from a blank text
        </Button>
      </div>
    </section>
  )
}
