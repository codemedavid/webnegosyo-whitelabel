'use client'

import { useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RecipeInfo } from '@/lib/texts/view/automations'
import { VARIABLE_LABELS } from '@/lib/texts/view/automation-editor'
import { insertVariable } from '@/lib/texts/view/message'
import { useTexts } from '../texts-context'
import { callAutomations } from './call-automations'

const UNAVAILABLE = "Write it for me isn't working right now. Write your own, or try again in a minute."

/** The message with the recipe's word chips and "Write it for me". */
export function AutomationMessage({ info, value, problem, onChange }: { info: RecipeInfo; value: string; problem: string | null; onChange: (value: string) => void }) {
  const { tenantId } = useTexts()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [options, setOptions] = useState<string[] | null>(null)
  const [isWriting, setWriting] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)

  const write = async (language: 'en' | 'tl') => {
    setWriting(true)
    setWriteError(null)
    const result = await callAutomations<{ messages: string[] }>(tenantId, { action: 'write', recipe: info.id, language })
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
        <h3 id="automation-message" className="text-sm font-semibold">Message</h3>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="min-h-11 rounded-full sm:min-h-8" disabled={isWriting} onClick={() => void write('en')}>
            {isWriting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} Write it for me
          </Button>
          <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" disabled={isWriting} onClick={() => void write('tl')}>Taglish</Button>
        </div>
      </div>
      {writeError && <p role="alert" className="text-sm text-destructive">{writeError}</p>}
      {options && (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3" aria-live="polite">
          <p className="text-sm font-medium">Tap one to use it. You can still edit it.</p>
          {options.map((option) => (
            <button key={option} type="button" onClick={() => { onChange(option); setOptions(null) }} className="w-full rounded-xl border bg-background p-3 text-left text-sm hover:border-foreground/40">
              {option}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {info.variables.map((key) => (
          <Button key={key} type="button" size="sm" variant="secondary" className="min-h-11 rounded-full sm:min-h-8" onClick={() => add(key)}>
            {VARIABLE_LABELS[key] ?? key}
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
        className="block w-full resize-y rounded-xl border bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {problem && <p id="automation-message-error" role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}
    </section>
  )
}
