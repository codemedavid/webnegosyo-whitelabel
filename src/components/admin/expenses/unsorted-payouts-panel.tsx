'use client'

import { useMemo, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { suggestCategoryForReason } from '@/lib/expenses/sort-suggest'
import type { Expense, ExpenseCategory, UnsortedPayout } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { CategoryBadge, TillBadge } from './expense-badges'
import { dayLabel, formatPeso, manilaDayOf, pesoWords, timeLabel } from './expense-format'
import { sortDrawerPayout } from './expense-mutations'
import { CategoryPicker } from './pickers'

export interface UnsortedPayoutsPanelProps {
  tenantSlug: string
  payouts: readonly UnsortedPayout[]
  categories: readonly ExpenseCategory[]
  recentExpenses: readonly Expense[]
  outletNames: ReadonlyMap<string, string>
  isMultiBranch: boolean
  today: string
  onSorted?: (movementId: string) => void
}

/**
 * Drawer pay-outs from older app builds, recorded with only a typed reason.
 * Each one carries a suggested category from its reason ("yelo" → Ice); one
 * tap files it. Nothing about the pay-out changes: sorting adds an expense
 * linked to it (contract §5, `sort_drawer_payout`).
 */
export function UnsortedPayoutsPanel({
  tenantSlug,
  payouts,
  categories,
  recentExpenses,
  outletNames,
  isMultiBranch,
  today,
  onSorted,
}: UnsortedPayoutsPanelProps) {
  const [sortedIds, setSortedIds] = useState<ReadonlySet<string>>(new Set())
  const remaining = payouts.filter((payout) => !sortedIds.has(payout.movementId))

  if (remaining.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-border">
        <p className="text-[16px] font-bold text-wn-ink">Every drawer pay-out is sorted.</p>
        <p className="mx-auto mt-1 max-w-md text-[14px] text-wn-stone">
          New pay-outs are filed with a category at the register, so this list stays empty.
        </p>
      </div>
    )
  }

  return (
    <section aria-labelledby="unsorted-heading" className="overflow-hidden rounded-2xl bg-white ring-1 ring-border">
      <header className="border-b border-wn-line px-5 py-4">
        <h2 id="unsorted-heading" className="text-[16px] font-bold text-wn-ink">
          {remaining.length} drawer pay-out{remaining.length === 1 ? '' : 's'} to sort
        </h2>
        <p className="mt-0.5 text-[13.5px] text-wn-stone">
          These left the drawer with only a note. Pick what each was for so Profit counts it. The drawer itself doesn’t change.
        </p>
      </header>
      <ul>
        {remaining.map((payout) => (
          <PayoutRow
            key={payout.movementId}
            tenantSlug={tenantSlug}
            payout={payout}
            categories={categories}
            recentExpenses={recentExpenses}
            branchName={isMultiBranch && payout.outletId ? (outletNames.get(payout.outletId) ?? null) : null}
            today={today}
            onSorted={() => {
              setSortedIds((current) => new Set([...current, payout.movementId]))
              onSorted?.(payout.movementId)
            }}
          />
        ))}
      </ul>
    </section>
  )
}

interface PayoutRowProps {
  tenantSlug: string
  payout: UnsortedPayout
  categories: readonly ExpenseCategory[]
  recentExpenses: readonly Expense[]
  branchName: string | null
  today: string
  onSorted: () => void
}

function PayoutRow({ tenantSlug, payout, categories, recentExpenses, branchName, today, onSorted }: PayoutRowProps) {
  const suggestion = useMemo(() => suggestCategoryForReason(payout.reason, categories), [payout.reason, categories])
  const suggested = suggestion ? categories.find((category) => category.id === suggestion.categoryId) : undefined
  const [isChoosing, setIsChoosing] = useState(false)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sortInto(categoryId: string): Promise<void> {
    const category = categories.find((entry) => entry.id === categoryId)
    if (!category) return
    setIsSaving(true)
    setError(null)
    // Keep what the cashier typed as the note; "Other" needs one anyway.
    const result = await sortDrawerPayout(tenantSlug, { movementId: payout.movementId, categoryId, note: payout.reason.trim() || null })
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`Sorted · ${category.name} ${formatPeso(payout.amountCents)}`)
    onSorted()
  }

  const day = manilaDayOf(payout.createdAt)
  return (
    <li className="flex flex-col gap-3 border-b border-wn-line px-5 py-4 last:border-b-0 md:flex-row md:items-center md:gap-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-wn-ink">“{payout.reason.trim() || 'No reason typed'}”</p>
          <TillBadge />
        </div>
        <p className="mt-0.5 text-[13px] tabular-nums text-wn-stone">
          {payout.recordedByName} · {day ? dayLabel(day, today) : ''} {timeLabel(payout.createdAt)}
          {branchName ? ` · ${branchName}` : ''}
        </p>
      </div>
      <p
        className="shrink-0 text-[16px] font-bold tabular-nums text-wn-ink md:w-28 md:text-right"
        aria-label={pesoWords(payout.amountCents)}
      >
        −{formatPeso(payout.amountCents)}
      </p>
      <div className="flex shrink-0 flex-col gap-2 md:w-[340px]">
        {isChoosing ? (
          <div className="flex flex-col gap-2">
            <CategoryPicker
              label="File it under"
              categories={categories}
              recentExpenses={recentExpenses}
              value={chosenId}
              onChange={setChosenId}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsChoosing(false)} className={GHOST_BUTTON}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!chosenId || isSaving}
                onClick={() => chosenId && void sortInto(chosenId)}
                className={SOLID_BUTTON}
              >
                {isSaving ? 'Sorting…' : 'Sort'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {suggested ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void sortInto(suggested.id)}
                aria-label={`Sort as ${suggested.name}`}
                className={cn(SOLID_BUTTON, 'pl-2')}
              >
                <CategoryBadge category={suggested} size="sm" />
                <span className="max-w-44 truncate">{isSaving ? 'Sorting…' : suggested.name}</span>
                {suggestion?.confidence === 'high' ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
              </button>
            ) : (
              <span className="text-[13px] text-wn-stone">No guess from this note</span>
            )}
            <button type="button" onClick={() => setIsChoosing(true)} className={GHOST_BUTTON}>
              Choose…
            </button>
          </div>
        )}
        {suggested && !isChoosing && (
          <p className="text-right text-[12px] text-wn-stone">
            {suggestion?.confidence === 'high' ? 'Suggested from the note' : 'A guess from the note. Check it.'}
          </p>
        )}
        {error && (
          <p role="alert" className="text-right text-[12.5px] font-semibold text-red-800">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}

const SOLID_BUTTON =
  'inline-flex min-h-10 items-center gap-2 rounded-full bg-wn-ink px-4 text-[13.5px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-60'
const GHOST_BUTTON =
  'inline-flex min-h-10 items-center rounded-full bg-white px-4 text-[13.5px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink'
