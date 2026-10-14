'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RecipeInfo } from '@/lib/texts/view/automations'
import { canStep, knobLimits, knobValue, sentenceFor, stepKnob, unitFor, type AutomationDraft } from '@/lib/texts/view/automation-editor'

/** "Text guests who haven't ordered in [− 30 days +]". */
export function KnobSentence({ info, draft, onChange }: { info: RecipeInfo; draft: AutomationDraft; onChange: (params: AutomationDraft['params']) => void }) {
  const sentence = sentenceFor(info.id)
  const value = knobValue(draft, sentence.knob, info)
  const limits = knobLimits(info, sentence.knob)
  const set = (direction: 1 | -1) => onChange({ ...draft.params, [sentence.knob]: stepKnob(value, direction, sentence.knob, limits) })
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-wn-line bg-gradient-to-br from-wn-sand to-white p-4 text-[17px] font-medium leading-relaxed tracking-tight">
      <span>{sentence.before}</span>
      <span className="inline-flex items-center gap-1 rounded-full border border-wn-line bg-white px-1 shadow-sm">
        <Button type="button" variant="ghost" size="icon" className="size-11 rounded-full sm:size-8" disabled={!canStep(value, -1, limits)} onClick={() => set(-1)} aria-label="Less">
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-16 text-center font-semibold tabular-nums" aria-live="polite">{value} {unitFor(value, sentence.unit)}</span>
        <Button type="button" variant="ghost" size="icon" className="size-11 rounded-full sm:size-8" disabled={!canStep(value, 1, limits)} onClick={() => set(1)} aria-label="More">
          <Plus className="h-4 w-4" />
        </Button>
      </span>
      {sentence.after && <span>{sentence.after}</span>}
    </p>
  )
}
