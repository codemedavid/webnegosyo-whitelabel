import { CalendarClock } from 'lucide-react'
import { BILL_PRESETS } from '@/lib/expenses/bill-schedule'

/** No bills yet: what the tab is for, and one tap to start from a familiar bill. */
export function BillsEmpty({ onStart }: { onStart: (presetKey: string | null) => void }) {
  return (
    <div className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-border">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-wn-sand ring-1 ring-wn-line">
        <CalendarClock className="size-5 text-wn-stone" aria-hidden />
      </span>
      <p className="mx-auto mt-4 max-w-md text-[16px] font-bold leading-snug text-wn-ink text-pretty">
        Rent, kuryente, sahod… set up the bills you pay every month and we’ll remind you before they’re due.
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-wn-stone">
        A bill is only a reminder. Profit counts it when you mark it paid.
      </p>
      <div role="group" aria-label="Start with" className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-1.5">
        {BILL_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onStart(preset.key)}
            className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-[13.5px] font-semibold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  )
}
