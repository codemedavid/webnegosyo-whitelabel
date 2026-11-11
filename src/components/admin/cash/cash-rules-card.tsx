'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { saveCashSettingsAction } from '@/app/actions/cash'
import {
  MAX_OVERDUE_GRACE_MINUTES,
  MAX_REASON_THRESHOLD_CENTS,
  MIN_OVERDUE_GRACE_MINUTES,
  REASON_THRESHOLD_STEP_CENTS,
  type CashSettings,
  type RemittanceMode,
} from '@/lib/cash/settings'
import { Switch } from '@/components/ui/switch'
import { formatMoney } from './cash-format'
import { changedRules, draftFrom, type CashRulesDraft } from './cash-rules-form'
import { FIELD_CLASS, PRIMARY_BUTTON, RuleRow, Segmented, SettingsCard } from './settings-ui'

const GRACE_CHOICES = [30, 60, 120, 180, 240, 360, 480, 720, 1080, MAX_OVERDUE_GRACE_MINUTES].filter(
  (minutes) => minutes >= MIN_OVERDUE_GRACE_MINUTES,
)

function graceLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  const hours = minutes / 60
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

const REMIT_OPTIONS: ReadonlyArray<{ value: RemittanceMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'optional', label: 'Optional' },
  { value: 'required', label: 'Required' },
]

export interface CashRulesCardProps {
  tenantSlug: string
  settings: CashSettings
  /** The store's orders live outside the platform database (Convex / own Supabase). */
  isPlatformBackend: boolean
}

/** Counting, short & over, remitting and selling: same rules and copy as the app's Shift & remit rules. */
export function CashRulesCard({ tenantSlug, settings, isPlatformBackend }: CashRulesCardProps) {
  const router = useRouter()
  const floatId = useId()
  const graceId = useId()
  const [draft, setDraft] = useState<CashRulesDraft>(() => draftFrom(settings))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const change = <K extends keyof CashRulesDraft>(key: K, value: CashRulesDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const diff = changedRules(settings, draft)
  const hasChanges = diff.ok && Object.keys(diff.patch).length > 0

  function save(): void {
    if (!diff.ok) {
      setError(diff.error)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await saveCashSettingsAction(tenantSlug, diff.patch)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Cash rules saved. Registers pick them up on their next refresh.')
      setDraft(draftFrom(result.data))
      router.refresh()
    })
  }

  const threshold = draft.varianceReasonFromCents
  const stepButton =
    'grid size-10 place-items-center rounded-full bg-white text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-40'

  return (
    <SettingsCard id="rules" title="Cash rules" description="How cashiers count, explain a difference and hand over cash at the end of a shift.">
      <RuleRow
        title="Count bills at end of shift"
        hint="Optional lets a cashier type one total instead of counting each bill and coin."
        control={
          <Segmented
            label="Count bills at end of shift"
            value={draft.requireDenominations ? 'required' : 'optional'}
            options={[
              { value: 'optional', label: 'Optional' },
              { value: 'required', label: 'Required' },
            ]}
            isDisabled={isPending}
            onChange={(value) => change('requireDenominations', value === 'required')}
          />
        }
      />
      <RuleRow
        title="Blind count"
        hint={
          <>
            Hide what should be in the drawer from cashiers until they have counted. Recommended.
            {!isPlatformBackend && ' On this store it hides the totals on the register only; shift sales are not on the web yet.'}
          </>
        }
        control={<Switch checked={draft.blindClose} disabled={isPending} onCheckedChange={(value) => change('blindClose', value)} aria-label="Blind count" />}
      />
      <RuleRow
        title="Ask for a reason when the difference is more than"
        hint="Short or over by more than this, the cashier picks a reason, like ‘Wrong sukli (change)’."
        control={
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="₱10 less"
              disabled={isPending || threshold <= 0}
              onClick={() => change('varianceReasonFromCents', Math.max(0, threshold - REASON_THRESHOLD_STEP_CENTS))}
              className={stepButton}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="min-w-16 text-center text-[16px] font-extrabold tabular-nums text-wn-ink" aria-live="polite">
              {formatMoney(threshold)}
            </span>
            <button
              type="button"
              aria-label="₱10 more"
              disabled={isPending || threshold >= MAX_REASON_THRESHOLD_CENTS}
              onClick={() => change('varianceReasonFromCents', Math.min(MAX_REASON_THRESHOLD_CENTS, threshold + REASON_THRESHOLD_STEP_CENTS))}
              className={stepButton}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        }
      />
      <RuleRow
        title="Remit at end of shift"
        hint="Required: a cashier can’t end a shift without saying who receives the cash."
        control={
          <Segmented label="Remit at end of shift" value={draft.remittanceMode} options={REMIT_OPTIONS} isDisabled={isPending} onChange={(value) => change('remittanceMode', value)} />
        }
      />
      <RuleRow
        title="Require a shift to sell"
        hint="The first sale without a shift opens Start shift, then carries on with the sale."
        control={
          <Switch checked={draft.requireShiftToSell} disabled={isPending} onCheckedChange={(value) => change('requireShiftToSell', value)} aria-label="Require a shift to sell" />
        }
      />
      <RuleRow
        title="A shift is overdue"
        hint="How long after the business day ends an open shift gets flagged."
        control={
          <>
            <label htmlFor={graceId} className="sr-only">
              Overdue after
            </label>
            <select
              id={graceId}
              value={draft.overdueGraceMinutes}
              disabled={isPending}
              onChange={(event) => change('overdueGraceMinutes', Number(event.target.value))}
              className={FIELD_CLASS}
            >
              {[...new Set([...GRACE_CHOICES, draft.overdueGraceMinutes])].sort((a, b) => a - b).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {graceLabel(minutes)} after
                </option>
              ))}
            </select>
          </>
        }
      />
      <RuleRow
        title="Usual starting float"
        hint="Blank = each drawer’s own float (set on the drawer)."
        control={
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold text-wn-stone" aria-hidden>
              ₱
            </span>
            <label htmlFor={floatId} className="sr-only">
              Usual starting float in pesos
            </label>
            <input
              id={floatId}
              inputMode="decimal"
              value={draft.defaultFloatText}
              placeholder="Each drawer’s own"
              disabled={isPending}
              onChange={(event) => change('defaultFloatText', event.target.value)}
              className={`${FIELD_CLASS} w-40 tabular-nums`}
            />
          </div>
        }
      />
      {error && (
        <p role="alert" className="text-[13.5px] font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-wn-line pt-4">
        <button type="button" disabled={!hasChanges || isPending} onClick={save} className={PRIMARY_BUTTON}>
          {isPending ? 'Saving…' : 'Save rules'}
        </button>
        {settings.updatedAt && (
          <p className="text-[12.5px] text-wn-stone">
            Last changed {new Date(settings.updatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}
            {settings.updatedByName && ` by ${settings.updatedByName}`}
          </p>
        )}
      </div>
    </SettingsCard>
  )
}
