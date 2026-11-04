import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import type { CashRefusal } from '@/lib/cash/cash-page'

const LOCKED_COPY: Readonly<Record<CashRefusal, { title: string; detail: string }>> = {
  no_account: {
    title: 'We couldn’t confirm your account.',
    detail: 'Sign out and back in. If this keeps happening, ask the store owner to check your staff access.',
  },
  other_store: {
    title: 'This cash book belongs to another store.',
    detail: 'Switch to your own store’s admin to see its shifts.',
  },
  no_permission: {
    title: 'Only the owner or someone who handles cash can open this.',
    detail: 'Ask the owner to turn on ‘Cash & day close’ for you.',
  },
}

/** Shown to an account without `cash_manage`. */
export function CashLocked({ reason }: { reason: CashRefusal }) {
  const copy = LOCKED_COPY[reason]
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

/** A read failed: say so, never show an empty day that might be wrong. */
export function CashLoadFailed({ what = 'the shifts' }: { what?: string }) {
  return (
    <div role="alert" className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-border">
      <p className="text-[17px] font-extrabold text-wn-ink">We couldn’t load {what}.</p>
      <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-wn-stone text-pretty">
        Something went wrong on our side. Reload the page to try again. Nothing was changed.
      </p>
    </div>
  )
}

/** A notice above the figures (fallback schedule, a day that could not be shown). */
export function CashNotice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <p
      className={
        tone === 'warning'
          ? 'rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13.5px] leading-snug text-amber-900 ring-1 ring-amber-200'
          : 'rounded-xl bg-wn-sand px-3.5 py-2.5 text-[13.5px] leading-snug text-wn-stone ring-1 ring-wn-line'
      }
    >
      {children}
    </p>
  )
}
