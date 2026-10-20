'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Link2Off, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AudiencePreset } from '@/lib/texts/types'
import { CAMPAIGN_VARIABLES, hasLink, insertVariable, messageProblem, removeEmoji, segmentMeter } from '@/lib/texts/view/message'
import { cn } from '@/lib/utils'
import { useTexts } from '../texts-context'
import { ComposerSection } from './composer-section'
import { WriteForMe } from './write-for-me'

interface MessageSectionProps {
  value: string
  onChange: (value: string) => void
  name: string
  audiencePreset: AudiencePreset
  reach: number
  showErrors: boolean
  isDone?: boolean
}

/** Announces "2 texts per guest" only when the number changes. */
function useSegmentAnnouncement(segments: number): string {
  const [text, setText] = useState('')
  const last = useRef(segments)
  useEffect(() => {
    if (last.current === segments) return
    last.current = segments
    setText(`${segments} ${segments === 1 ? 'text' : 'texts'} per guest`)
  }, [segments])
  return text
}

export function MessageSection({ value, onChange, name, audiencePreset, reach, showErrors, isDone = false }: MessageSectionProps) {
  const { tenantId, storeName, optOutLine } = useTexts()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const errorId = useId()
  const meterId = useId()
  const meter = segmentMeter({ template: value, storeName, optOutLine, reach })
  const announcement = useSegmentAnnouncement(meter.segments)
  const problem = messageProblem(value)
  const isEmpty = value.trim() === ''
  const visibleProblem = problem && (!isEmpty || showErrors) ? problem : null

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [value])

  const addVariable = (key: string) => {
    const node = textareaRef.current
    const selection = node ? { start: node.selectionStart, end: node.selectionEnd } : null
    const next = insertVariable(value, selection, key)
    onChange(next.text)
    requestAnimationFrame(() => {
      node?.focus()
      node?.setSelectionRange(next.cursor, next.cursor)
    })
  }

  return (
    <ComposerSection id="composer-message" step={2} title="Message" isDone={isDone}>
      <WriteForMe tenantId={tenantId} name={name} audiencePreset={audiencePreset} onPick={onChange} />
      <div className="space-y-2">
        <p className="text-xs text-wn-stone">Tap to add a guest&apos;s details</p>
        <div className="flex flex-wrap gap-2">
          {CAMPAIGN_VARIABLES.map((variable) => (
            <Button key={variable.key} type="button" size="sm" variant="outline" className="min-h-11 rounded-full border-dashed bg-white px-3 text-[13px] font-medium sm:min-h-8" onClick={() => addVariable(variable.key)}>
              <Plus className="h-3.5 w-3.5 text-wn-stone" aria-hidden="true" /> {variable.label}
            </Button>
          ))}
        </div>
      </div>
      <div className={cn('rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(29,24,21,0.04)] transition-shadow focus-within:border-stone-400 focus-within:ring-4 focus-within:ring-stone-200/60', visibleProblem && 'border-red-400')}>
        <label htmlFor="composer-message-text" className="sr-only">Message</label>
        <textarea
          id="composer-message-text"
          ref={textareaRef}
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={visibleProblem !== null}
          aria-describedby={`${meterId}${visibleProblem ? ` ${errorId}` : ''}`}
          placeholder="Hi {{firstName}}, …"
          className="block min-h-28 w-full resize-none rounded-xl bg-transparent px-4 py-3 text-sm outline-none"
        />
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div id={meterId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className={cn('text-sm tabular-nums', meter.tone === 'amber' && 'text-amber-800 dark:text-amber-300', meter.tone === 'error' && 'text-destructive', meter.tone === 'muted' && 'text-muted-foreground')}>
          {meter.text}
        </p>
        {meter.canRemoveEmoji && (
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => onChange(removeEmoji(value))}>Remove emoji</Button>
        )}
      </div>
      {visibleProblem && <p id={errorId} role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{visibleProblem}</p>}
      {hasLink(value) && (
        <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <Link2Off className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Phone networks in the Philippines often block texts with links. Tell guests to search your store name or reply instead. We measure who comes back, not clicks.</span>
        </p>
      )}
    </ComposerSection>
  )
}
