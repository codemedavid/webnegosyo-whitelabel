'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTextsActions } from '../texts-actions'
import type { AudiencePreset } from '@/lib/texts/types'

const UNAVAILABLE = "Write it for me isn't working right now. Write your own, or try again in a minute."

type Phase = { kind: 'closed' } | { kind: 'writing' } | { kind: 'ready'; messages: string[] } | { kind: 'failed'; error: string }

interface WriteForMeProps {
  tenantId: string
  name: string
  audiencePreset: AudiencePreset
  onPick: (message: string) => void
}

/** Three short options from the store name, the audience and the goal; one tap uses one. */
export function WriteForMe({ tenantId, name, audiencePreset, onPick }: WriteForMeProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' })
  const [language, setLanguage] = useState<'en' | 'tl'>('en')
  const actions = useTextsActions()

  const write = async (lang: 'en' | 'tl') => {
    setLanguage(lang)
    setPhase({ kind: 'writing' })
    try {
      const result = await actions.writeCampaignMessagesAction(tenantId, { name, audiencePreset, language: lang })
      setPhase(result.ok && result.value.messages.length > 0 ? { kind: 'ready', messages: result.value.messages } : { kind: 'failed', error: result.ok ? UNAVAILABLE : result.error || UNAVAILABLE })
    } catch {
      setPhase({ kind: 'failed', error: UNAVAILABLE })
    }
  }

  if (phase.kind === 'closed') {
    return (
      <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-full border-wn-coral/30 bg-wn-coral-wash px-3.5 text-wn-coral-deep hover:bg-wn-coral-wash/70 hover:text-wn-coral-deep sm:min-h-8" onClick={() => void write(language)}>
        <Sparkles className="h-4 w-4" aria-hidden="true" /> Write it for me
      </Button>
    )
  }

  return (
    <div className="w-full space-y-3 rounded-2xl border border-wn-coral/20 bg-gradient-to-br from-wn-coral-wash/70 to-white p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {phase.kind === 'writing' ? 'Writing three options…' : phase.kind === 'ready' ? 'Tap one to use it. You can still edit it.' : phase.error}
        </p>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onClick={() => setPhase({ kind: 'closed' })}>Close</Button>
      </div>
      {phase.kind === 'writing' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />}
      {phase.kind === 'ready' && (
        <ul className="space-y-2">
          {phase.messages.map((message) => (
            <li key={message}>
              <button
                type="button"
                onClick={() => { onPick(message); setPhase({ kind: 'closed' }) }}
                className="w-full rounded-xl border border-wn-line bg-white p-3 text-left text-sm shadow-[0_1px_2px_rgba(29,24,21,0.04)] transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                {message}
              </button>
            </li>
          ))}
        </ul>
      )}
      {phase.kind !== 'writing' && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => void write('en')}>{phase.kind === 'failed' ? 'Try again' : 'More in English'}</Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => void write('tl')}>In Taglish</Button>
        </div>
      )}
    </div>
  )
}
