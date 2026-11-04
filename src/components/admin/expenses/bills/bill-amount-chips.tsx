'use client'

import { formatPeso, pesoWords } from '../expense-format'
import { amountText, type AmountChip } from './bill-board-model'

/** "Usual ₱6,200 · Last time ₱6,450": one tap fills the amount of a bill that changes. */
export function BillAmountChips({ chips, onPick }: { chips: readonly AmountChip[]; onPick: (amountText: string) => void }) {
  return (
    <div role="group" aria-label="Amounts paid before" className="-mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onPick(amountText(chip.cents))}
          aria-label={`${chip.label}: ${pesoWords(chip.cents)}`}
          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-semibold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          <span className="text-wn-stone">{chip.label}</span>
          <span className="tabular-nums">{formatPeso(chip.cents)}</span>
        </button>
      ))}
    </div>
  )
}
