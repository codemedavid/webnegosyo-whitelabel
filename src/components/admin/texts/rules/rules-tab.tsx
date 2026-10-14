'use client'

import { useEffect, useState } from 'react'
import { Gauge, Loader2, Moon, ShieldCheck, Star, Timer, UserCheck } from 'lucide-react'
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
import { IconTile } from '../status-chip'
import { useTextsActions } from '../texts-actions'

const FOCUS_IDS = { review_link: 'rule-review-url', quiet_hours: 'rule-quiet-start' } as const

function toInt(raw: string): number {
  const value = Math.floor(Number(raw))
  return Number.isFinite(value) ? value : 0
}

/** The store's texting rules: one card, a save bar only while something changed. */
export function RulesTab() {
  const { tenantId, isDemo, rules, url, refresh } = useTexts()
  const actions = useTextsActions()
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
    const done = await runAction(() => callAutomations<{ settings: TextingRules }>(actions, tenantId, { action: 'save_settings', settings: next }))
    setSaving(false)
    if (!done) return
    setSaved(done.settings ?? next)
    setForm(done.settings ?? next)
    toast.success('Rules saved. Every text follows them now.')
    refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,42rem)_1fr]">
      <form className="rounded-2xl border border-wn-line bg-white p-5 shadow-[0_1px_2px_rgba(29,24,21,0.04)] sm:p-6" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <RuleField id="rule-quiet-start" icon={Moon} label="Quiet hours" hint={RULE_HINTS.quietHours} error={quietError}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            No texts from
            <Input id="rule-quiet-start" type="time" value={form.quietHoursStart} onChange={(e) => set({ quietHoursStart: e.target.value })}
              aria-describedby={describedBy('rule-quiet-start', quietError)} aria-invalid={quietError !== null} className="h-11 w-32 bg-white sm:h-10" />
            to
            <Input type="time" aria-label="Quiet hours end" value={form.quietHoursEnd} onChange={(e) => set({ quietHoursEnd: e.target.value })}
              aria-invalid={quietError !== null} className="h-11 w-32 bg-white sm:h-10" />
          </div>
        </RuleField>
        <RuleField id="rule-guest-cap" icon={UserCheck} label="One text per guest every" hint={RULE_HINTS.guestCap} error={showErrors ? problems.guestCapDays : null}>
          <div className="flex items-center gap-2 text-sm">
            <Input id="rule-guest-cap" type="number" min={1} max={30} value={form.guestCapDays} onChange={(e) => set({ guestCapDays: toInt(e.target.value) })}
              aria-describedby={describedBy('rule-guest-cap', problems.guestCapDays)} className="h-11 w-20 tabular-nums sm:h-9" /> days
          </div>
        </RuleField>
        <RuleField id="rule-daily-limit" icon={Gauge} label="Daily limit" hint={RULE_HINTS.dailyLimit} note={dailyLimitNote(form.dailyLimit)} error={showErrors ? problems.dailyLimit : null}>
          <div className="flex items-center gap-2 text-sm">
            At most
            <Input id="rule-daily-limit" type="number" min={1} max={500} value={form.dailyLimit} onChange={(e) => set({ dailyLimit: toInt(e.target.value) })}
              aria-describedby={describedBy('rule-daily-limit', problems.dailyLimit)} className="h-11 w-24 tabular-nums sm:h-9" /> texts a day
          </div>
        </RuleField>
        <div className="flex gap-4 border-b border-wn-line py-5">
          <IconTile size="sm" className="mt-0.5"><Timer /></IconTile>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">Pace</p>
            <p className="mt-0.5 text-[13px] text-wn-stone">{PACE_LINE}</p>
          </div>
        </div>
        <RuleField id="rule-review-url" icon={Star} label="Review link" hint={RULE_HINTS.reviewUrl} error={showErrors || form.reviewUrl ? problems.reviewUrl : null}>
          <Input id="rule-review-url" type="url" inputMode="url" placeholder="https://g.page/r/…" value={form.reviewUrl ?? ''} onChange={(e) => set({ reviewUrl: e.target.value })}
            aria-describedby={describedBy('rule-review-url', problems.reviewUrl)} className="h-11 bg-white sm:h-10" />
        </RuleField>
        {isDirty && (
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex items-center justify-between gap-2 rounded-b-2xl border-t border-wn-line bg-white/95 px-5 py-3 shadow-[0_-4px_16px_-12px_rgba(29,24,21,0.25)] backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
            <span className="text-sm text-wn-stone">Unsaved changes</span>
            <span className="flex gap-2">
              <Button type="button" variant="ghost" className="min-h-11 rounded-full sm:min-h-9" onClick={() => { setForm(saved); setShowErrors(false) }} disabled={isSaving}>Discard</Button>
              <Button type="submit" className="min-h-11 rounded-full px-5 sm:min-h-9" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save rules
              </Button>
            </span>
          </div>
        )}
      </form>
      <aside className="hidden h-fit space-y-3 rounded-2xl border border-wn-line bg-gradient-to-br from-wn-sand to-white p-5 text-sm lg:block">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" /> Every text follows these</p>
        <p className="text-wn-stone">Campaigns and automatic texts both wait out quiet hours, skip guests texted recently, and stop at the daily limit. Texts that wait are never lost.</p>
        <p className="text-wn-stone">Promo texts in the Philippines may not go out from 9 PM to 7 AM.</p>
      </aside>
    </div>
  )
}
