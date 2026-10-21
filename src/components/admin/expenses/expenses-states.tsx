import type { ReactNode } from 'react'
import { Lock, Plus } from 'lucide-react'

/** Shown to an account without the `expenses` key (contract §7). */
export function ExpensesLocked({ reason = 'no_permission' }: { reason?: 'no_permission' | 'other_store' | 'no_account' }) {
  const copy =
    reason === 'no_account'
      ? { title: 'We couldn’t confirm your account.', detail: 'Sign out and back in. If this keeps happening, ask the store owner to check your staff access.' }
      : reason === 'other_store'
        ? { title: 'These expenses belong to another store.', detail: 'Switch to your own store’s admin to see its expenses.' }
        : {
            title: 'Only the owner can see expenses.',
            detail: 'Ask them to turn on ‘Expenses’ for you.',
          }
  return (
    <div className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-border">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-wn-sand ring-1 ring-wn-line">
        <Lock className="size-5 text-wn-stone" aria-hidden />
      </span>
      <p className="mt-4 text-[17px] font-extrabold text-wn-ink">{copy.title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-wn-stone text-pretty">{copy.detail}</p>
    </div>
  )
}

/** The read failed: say so, never show an empty month that might be wrong. */
export function ExpensesLoadFailed({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-border">
      <p className="text-[17px] font-extrabold text-wn-ink">We couldn’t load your expenses.</p>
      <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-wn-stone text-pretty">
        {message} Reload the page to try again. Nothing you saved is lost.
      </p>
    </div>
  )
}

interface EmptyMonthProps {
  monthName: string
  isCurrent: boolean
  onAdd?: () => void
}

/** Plan §5.7: empty can mean missing, so the copy invites the first entry rather than celebrating zero. */
export function EmptyMonth({ monthName, isCurrent, onAdd }: EmptyMonthProps) {
  return (
    <div className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-border">
      <p className="text-[17px] font-extrabold text-wn-ink">No expenses recorded for {monthName}.</p>
      <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-wn-stone text-pretty">
        {isCurrent
          ? 'When you pay for something, add it here. Kung may binayaran ka, idagdag dito.'
          : 'If you paid for anything that month, you can still add it with its real date.'}
      </p>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-wn-ink px-5 text-[14.5px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2"
        >
          <Plus className="size-4" aria-hidden />
          Add expense
        </button>
      )}
    </div>
  )
}

/** No row matches the view and filters. */
export function NoMatches({ onClear, children }: { onClear?: () => void; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-border">
      <p className="text-[16px] font-bold text-wn-ink">Nothing here for these filters.</p>
      {children && <p className="mx-auto mt-1 max-w-md text-[14px] text-wn-stone">{children}</p>}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[14px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          Show everything
        </button>
      )}
    </div>
  )
}

/**
 * First run: what this page is for, in one sentence the owner already knows
 * (plan §5.7). Dismissed per browser; it is a convenience, not state.
 */
export function ProfitHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside aria-label="How expenses feed Profit" className="flex flex-col gap-3 rounded-2xl bg-wn-sand px-5 py-4 ring-1 ring-wn-line sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold tabular-nums text-wn-ink">Profit = Sales − Ingredients − Expenses</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-wn-stone">
          We already know your sales. Add what you pay for (rent, gas, ice, salaries) and Profit does the math. Cashiers can
          pay small things straight from the drawer in the app.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex min-h-10 shrink-0 items-center self-start rounded-full bg-white px-4 text-[13.5px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink sm:self-center"
      >
        Got it
      </button>
    </aside>
  )
}
