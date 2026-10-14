'use client'

import { useRef, useState } from 'react'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RecipeInfo } from '@/lib/texts/view/automations'
import { VARIABLE_LABELS } from '@/lib/texts/view/automation-editor'
import { insertVariable } from '@/lib/texts/view/message'
import { useTexts } from '../texts-context'
import { callAutomations } from './call-automations'
import { useTextsActions } from '../texts-actions'

const UNAVAILABLE = "Write it for me isn't working right now. Write your own, or try again in a minute."

/** The message with the recipe's word chips and "Write it for me". */
export function AutomationMessage({ info, value, problem, onChange }: { info: RecipeInfo; value: string; problem: string | null; onChange: (value: string) => void }) {
  const { tenantId } = useTexts()
  const actions = useTextsActions()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [options, setOptions] = useState<string[] | null>(null)
  const [isWriting, setWriting] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)

  const write = async (language: 'en' | 'tl') => {
    setWriting(true)
    setWriteError(null)
    const result = await callAutomations<{ messages: string[] }>(actions, tenantId, { action: 'write', recipe: info.id, language })
    setWriting(false)
    if (result.ok && result.value.messages.length > 0) setOptions(result.value.messages)
    else setWriteError(result.ok ? UNAVAILABLE : result.error || UNAVAILABLE)
  }

  const add = (key: string) => {
    const node = ref.current
    const next = insertVariable(value, node ? { start: node.selectionStart, end: node.selectionEnd } : null, key)
    onChange(next.text)
    requestAnimationFrame(() => { node?.focus(); node?.setSelectionRange(next.cursor, next.cursor) })
  }

  return (
    <section aria-labelledby="automation-message" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="automation-message" className="text-[15px] font-semibold tracking-tight">Message</h3>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="min-h-11 rounded-full border-wn-coral/30 bg-wn-coral-wash px-3.5 text-wn-coral-deep hover:bg-wn-coral-wash/70 hover:text-wn-coral-deep sm:min-h-8" disabled={isWriting} onClick={() => void write('en')}>
            {isWriting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} Write it for me
          </Button>
          <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" disabled={isWriting} onClick={() => void write('tl')}>Taglish</Button>
        </div>
      </div>
      {writeError && <p role="alert" className="text-sm text-destructive">{writeError}</p>}
      {options && (
        <div className="space-y-2 rounded-2xl border border-wn-coral/20 bg-gradient-to-br from-wn-coral-wash/70 to-white p-4" aria-live="polite">
          <p className="text-sm font-medium">Tap one to use it. You can still edit it.</p>
          {options.map((option) => (
            <button key={option} type="button" onClick={() => { onChange(option); setOptions(null) }} className="w-full rounded-xl border border-wn-line bg-white p-3 text-left text-sm shadow-[0_1px_2px_rgba(29,24,21,0.04)] hover:border-stone-400">
              {option}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {info.variables.map((key) => (
          <Button key={key} type="button" size="sm" variant="outline" className="min-h-11 rounded-full border-dashed bg-white px-3 text-[13px] font-medium sm:min-h-8" onClick={() => add(key)}>
            <Plus className="h-3.5 w-3.5 text-wn-stone" aria-hidden="true" /> {VARIABLE_LABELS[key] ?? key}
          </Button>
        ))}
      </div>
      <label htmlFor="automation-message-text" className="sr-only">Message</label>
      <textarea
        id="automation-message-text"
        ref={ref}
        rows={5}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={problem !== null}
        aria-describedby={problem ? 'automation-message-error' : undefined}
        className="block w-full resize-y rounded-2xl border border-border bg-white px-4 py-3 text-sm shadow-[0_1px_2px_rgba(29,24,21,0.04)] outline-none focus-visible:border-stone-400 focus-visible:ring-4 focus-visible:ring-stone-200/60"
      />
      {problem && <p id="automation-message-error" role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}
    </section>
  )
}
