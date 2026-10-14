'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TextingRules } from '@/lib/texts/view/automations'
import { dailyLimitNote, PACE_LINE, RULE_HINTS, rulesForSave, rulesProblems, sameRules } from '@/lib/texts/view/rules'
import { DEMO_READONLY, runAction } from '../run-action'
import { useTexts } from '../texts-context'
import { callAutomations } from '../automatic/call-automations'
import { useUnloadGuard } from '../use-unload-guard'
import { describedBy, RuleField } from './rule-field'

const FOCUS_IDS = { review_link: 'rule-review-url', quiet_hours: 'rule-quiet-start' } as const

function toInt(raw: string): number {
  const value = Math.floor(Number(raw))
  return Number.isFinite(value) ? value : 0
}

/** The store's texting rules: one card, a save bar only while something changed. */
export function RulesTab() {
  const { tenantId, isDemo, rules, url, refresh } = useTexts()
  const [saved, setSaved] = useState<TextingRules>(rules)
  const [form, setForm] = useState<TextingRules>(rules)
  const [isSaving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const problems = rulesProblems(form)
  const isDirty = !sameRules(saved, form)
  const quietError = problems.quietHoursStart ?? null
  const set = (patch: Partial<TextingRules>) => setForm((prev) => ({ ...prev, ...patch }))
  useUnloadGuard(isDirty)

  useEffect(() => {
    if (!url.focus) return
    const node = document.getElementById(FOCUS_IDS[url.focus])
    node?.scrollIntoView({ block: 'center' })
    node?.focus()
  }, [url.focus])

  const save = async () => {
    setShowErrors(true)
    if (Object.keys(problems).length > 0) return
    if (isDemo) return void toast.info(DEMO_READONLY)
    setSaving(true)
    const next = rulesForSave(form)
    const done = await runAction(() => callAutomations<{ settings: TextingRules }>(tenantId, { action: 'save_settings', settings: next }))
    setSaving(false)
    if (!done) return
    setSaved(done.settings ?? next)
    setForm(done.settings ?? next)
    toast.success('Rules saved. Every text follows them now.')
    refresh()
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form className="rounded-2xl border bg-card p-5" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <RuleField id="rule-quiet-start" label="Quiet hours" hint={RULE_HINTS.quietHours} error={quietError}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            No texts from
            <Input id="rule-quiet-start" type="time" value={form.quietHoursStart} onChange={(e) => set({ quietHoursStart: e.target.value })}
              aria-describedby={describedBy('rule-quiet-start', quietError)} aria-invalid={quietError !== null} className="h-11 w-32 sm:h-9" />
            to
            <Input type="time" aria-label="Quiet hours end" value={form.quietHoursEnd} onChange={(e) => set({ quietHoursEnd: e.target.value })}
              aria-invalid={quietError !== null} className="h-11 w-32 sm:h-9" />
          </div>
        </RuleField>
        <RuleField id="rule-guest-cap" label="One text per guest every" hint={RULE_HINTS.guestCap} error={showErrors ? problems.guestCapDays : null}>
          <div className="flex items-center gap-2 text-sm">
            <Input id="rule-guest-cap" type="number" min={1} max={30} value={form.guestCapDays} onChange={(e) => set({ guestCapDays: toInt(e.target.value) })}
              aria-describedby={describedBy('rule-guest-cap', problems.guestCapDays)} className="h-11 w-20 tabular-nums sm:h-9" /> days
          </div>
        </RuleField>
        <RuleField id="rule-daily-limit" label="Daily limit" hint={RULE_HINTS.dailyLimit} note={dailyLimitNote(form.dailyLimit)} error={showErrors ? problems.dailyLimit : null}>
          <div className="flex items-center gap-2 text-sm">
            At most
            <Input id="rule-daily-limit" type="number" min={1} max={500} value={form.dailyLimit} onChange={(e) => set({ dailyLimit: toInt(e.target.value) })}
              aria-describedby={describedBy('rule-daily-limit', problems.dailyLimit)} className="h-11 w-24 tabular-nums sm:h-9" /> texts a day
          </div>
        </RuleField>
        <div className="border-b py-5">
          <p className="text-sm font-semibold">Pace</p>
          <p className="mt-1 text-sm text-muted-foreground">{PACE_LINE}</p>
        </div>
        <RuleField id="rule-review-url" label="Review link" hint={RULE_HINTS.reviewUrl} error={showErrors || form.reviewUrl ? problems.reviewUrl : null}>
          <Input id="rule-review-url" type="url" inputMode="url" placeholder="https://g.page/r/…" value={form.reviewUrl ?? ''} onChange={(e) => set({ reviewUrl: e.target.value })}
            aria-describedby={describedBy('rule-review-url', problems.reviewUrl)} className="h-11 sm:h-9" />
        </RuleField>
        {isDirty && (
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex items-center justify-end gap-2 rounded-b-2xl border-t bg-background/95 px-5 py-3 backdrop-blur">
            <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => { setForm(saved); setShowErrors(false) }} disabled={isSaving}>Discard</Button>
            <Button type="submit" className="min-h-11 sm:min-h-9" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save rules
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
