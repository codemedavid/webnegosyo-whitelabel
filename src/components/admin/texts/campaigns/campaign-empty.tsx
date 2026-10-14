'use client'

import { MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CAMPAIGN_PRESETS } from '@/lib/texts/view/presets'
import { useTexts } from '../texts-context'

/** No campaigns yet: the presets, ready to change. */
export function CampaignEmpty() {
  const { setUrl } = useTexts()
  return (
    <section className="space-y-5 rounded-2xl border border-dashed p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span className="mb-3 rounded-full bg-muted p-3"><MessageSquareText className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></span>
        <h2 className="text-lg font-semibold">Send your first campaign</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">Text a group of your guests from your own phone. Pick one to start, change anything.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAMPAIGN_PRESETS.map((preset) => (
          <li key={preset.id} className="flex flex-col rounded-2xl border bg-card">
            <button
              type="button"
              onClick={() => setUrl({ campaign: 'new', preset: preset.id })}
              className="flex-1 rounded-2xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-semibold">{preset.title}</span>
              <span className="block text-sm text-muted-foreground">{preset.tagline}</span>
            </button>
            {preset.automaticTwin && (
              <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                Want this every day, on its own? Turn on{' '}
                <button type="button" className="font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => setUrl({ automatic: preset.automaticTwin?.recipe ?? null })}>
                  {preset.automaticTwin.title}
                </button>{' '}
                in Automatic.
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="text-center">
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setUrl({ campaign: 'new', preset: null })}>
          Start from a blank text
        </Button>
      </div>
    </section>
  )
}
