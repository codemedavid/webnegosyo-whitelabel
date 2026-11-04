'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { archiveServicePeriodAction, saveServicePeriodAction } from '@/app/actions/cash'
import { SERVICE_PERIOD_NAME_MAX, formatPeriodTimes, type ServicePeriod } from '@/lib/cash/service-periods'
import { cn } from '@/lib/utils'
import { FIELD_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SettingsCard } from './settings-ui'

const QUARTER_HOURS = Array.from({ length: 96 }, (_, index) => index * 15)
const EVERY_BRANCH = ''

interface Draft {
  id: string | null
  name: string
  startsMinutes: number
  endsMinutes: number
  outletId: string | null
}

const NEW_DRAFT: Draft = { id: null, name: '', startsMinutes: 720, endsMinutes: 1200, outletId: null }

export interface ServicePeriodsCardProps {
  tenantSlug: string
  periods: ServicePeriod[]
  /** Branches a period may be tied to; null = the store has one location. */
  branches: Array<{ value: string; label: string }> | null
  /** A branch-locked manager may only add periods for their own branch. */
  lockedOutletId: string | null
  outletNames: Record<string, string>
  /** The list could not be read. */
  loadError: string | null
}

function timeLabel(minutes: number): string {
  return formatPeriodTimes({ startsMinutes: minutes, endsMinutes: minutes }).split('–')[0]
}

function TimeSelect({ label, value, onChange, isDisabled }: { label: string; value: number; onChange: (value: number) => void; isDisabled: boolean }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
      {label}
      <select id={id} value={value} disabled={isDisabled} onChange={(event) => onChange(Number(event.target.value))} className={FIELD_CLASS}>
        {QUARTER_HOURS.map((minutes) => (
          <option key={minutes} value={minutes}>
            {timeLabel(minutes)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Named shifts ("Day shift 12 PM–8 PM"). Optional; without them each clocked-in shift is its own report. */
export function ServicePeriodsCard({ tenantSlug, periods, branches, lockedOutletId, outletNames, loadError }: ServicePeriodsCardProps) {
  const router = useRouter()
  const nameId = useId()
  const branchId = useId()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function open(next: Draft): void {
    setError(null)
    setDraft(lockedOutletId ? { ...next, outletId: next.outletId ?? lockedOutletId } : next)
  }

  function save(): void {
    if (!draft) return
    setError(null)
    startTransition(async () => {
      const result = await saveServicePeriodAction(tenantSlug, draft)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(draft.id ? 'Shift saved.' : `${result.data.name} added.`)
      setDraft(null)
      router.refresh()
    })
  }

  function archive(period: ServicePeriod): void {
    if (!window.confirm(`Remove ${period.name}? Past days keep its name; new shifts can’t pick it.`)) return
    startTransition(async () => {
      const result = await archiveServicePeriodAction(tenantSlug, { id: period.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${period.name} removed.`)
      router.refresh()
    })
  }

  return (
    <SettingsCard
      id="shifts"
      title="Shifts"
      description="Optional. Name the shifts your team works, like Day shift 12 PM–8 PM and Night shift 8 PM–2 AM. Reports and the day close split sales by them, and cashiers pick one when they start."
    >
      {loadError ? (
        <p role="alert" className="text-[13.5px] text-red-700">{loadError}</p>
      ) : periods.length === 0 && !draft ? (
        <p className="text-[14px] text-wn-stone">No shifts named yet. Each cashier’s shift is its own report until you add some.</p>
      ) : (
        <ul className="divide-y divide-wn-line rounded-xl ring-1 ring-wn-line">
          {periods.map((period) => (
            <li key={period.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-wn-ink">{period.name}</span>
                <span className="block text-[13px] text-wn-stone tabular-nums">
                  {formatPeriodTimes(period)}
                  {period.endsMinutes <= period.startsMinutes && ' (ends the next day)'}
                  {branches && ` · ${period.outletId ? (outletNames[period.outletId] ?? 'A branch') : 'Every branch'}`}
                </span>
              </span>
              <button type="button" disabled={isPending} onClick={() => open({ ...period })} className={cn(SECONDARY_BUTTON, 'min-h-9 px-4')}>
                Edit
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => archive(period)}
                className="min-h-9 rounded-full px-3 text-[13.5px] font-bold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="flex flex-col gap-3 rounded-xl bg-wn-sand p-4 ring-1 ring-wn-line">
          <label htmlFor={nameId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
            Name
            <input
              id={nameId}
              value={draft.name}
              maxLength={SERVICE_PERIOD_NAME_MAX}
              placeholder="Day shift"
              disabled={isPending}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={FIELD_CLASS}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="Starts" value={draft.startsMinutes} isDisabled={isPending} onChange={(startsMinutes) => setDraft({ ...draft, startsMinutes })} />
            <TimeSelect label="Ends" value={draft.endsMinutes} isDisabled={isPending} onChange={(endsMinutes) => setDraft({ ...draft, endsMinutes })} />
          </div>
          {draft.endsMinutes <= draft.startsMinutes && (
            <p className="text-[13px] text-wn-stone">Ends the next day ({formatPeriodTimes(draft)}).</p>
          )}
          {branches && !lockedOutletId && (
            <label htmlFor={branchId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
              Branch
              <select
                id={branchId}
                value={draft.outletId ?? EVERY_BRANCH}
                disabled={isPending}
                onChange={(event) => setDraft({ ...draft, outletId: event.target.value || null })}
                className={FIELD_CLASS}
              >
                <option value={EVERY_BRANCH}>Every branch</option>
                {branches.map((branch) => (
                  <option key={branch.value} value={branch.value}>
                    {branch.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && <p role="alert" className="text-[13.5px] font-medium text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPending || draft.name.trim() === ''} onClick={save} className={PRIMARY_BUTTON}>
              {isPending ? 'Saving…' : draft.id ? 'Save shift' : 'Add shift'}
            </button>
            <button type="button" disabled={isPending} onClick={() => setDraft(null)} className={SECONDARY_BUTTON}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        !loadError && (
          <div>
            <button type="button" onClick={() => open(NEW_DRAFT)} className={SECONDARY_BUTTON}>
              <Plus className="size-4" aria-hidden />
              Add a shift
            </button>
          </div>
        )
      )}
    </SettingsCard>
  )
}
