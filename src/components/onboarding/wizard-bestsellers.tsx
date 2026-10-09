'use client'

import { useState } from 'react'
import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { MAX_BEST_SELLERS } from '@/lib/onboarding/answers'
import type { MenuReadDish, MenuReadView } from '@/lib/onboarding/menu-read'
import { ACCENT, ACCENT_INK, ACCENT_SOFT, FOCUS_RING, INPUT_CLASS, OB, QuestionHeading } from './onboarding-ui'
import type { StepProps } from './wizard-steps'
import { toggleBestSeller, type WizardDraft } from './wizard-draft'

const RANK_PLACEHOLDERS = ['e.g. Chicken Inasal', 'e.g. Sisig', 'e.g. Halo-halo'] as const
/** Enough to find a best seller on a phone without scrolling forever. */
const MAX_CHIPS = 36

const fold = (value: string) => value.trim().toLowerCase()

function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`
}

function DishChip({ dish, rank, isFull, onToggle }: { dish: MenuReadDish; rank: number; isFull: boolean; onToggle: () => void }) {
  const isPicked = rank > 0
  const edge = isPicked ? ACCENT : OB.lineStrong
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isPicked}
      disabled={!isPicked && isFull}
      onClick={onToggle}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 py-1.5 pl-2 pr-3.5 text-left text-[14px] font-semibold transition-[transform,box-shadow,border-color,background-color,opacity] duration-100 [box-shadow:0_3px_0_var(--tap-edge)] active:translate-y-[2px] active:[box-shadow:0_1px_0_var(--tap-edge)] disabled:opacity-40 motion-reduce:transition-none ${FOCUS_RING}`}
      style={{ borderColor: edge, backgroundColor: isPicked ? ACCENT_SOFT : OB.canvas, color: OB.ink, '--tap-edge': edge } as React.CSSProperties}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums"
        style={{ backgroundColor: isPicked ? ACCENT : OB.wash, color: isPicked ? ACCENT_INK : OB.faint }}
        aria-hidden
      >
        {isPicked ? rank : <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />}
      </span>
      <span className="min-w-0">{dish.name}</span>
      <span className="text-[12.5px] font-medium" style={{ color: OB.muted }}>{peso(dish.price)}</span>
    </button>
  )
}

function ReadingNote({ status }: { status: MenuReadView['status'] }) {
  if (status === 'reading') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5" style={{ borderColor: OB.line }} role="status">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" style={{ color: OB.ink }} aria-hidden />
        <span className="text-[14px] leading-snug" style={{ color: OB.muted }}>
          <b style={{ color: OB.ink }}>Reading your menu.</b> Your dishes show up here in a minute. You can also type them below.
        </span>
      </div>
    )
  }
  if (status === 'failed') {
    return (
      <p className="rounded-2xl px-4 py-3 text-[14px] leading-snug" style={{ backgroundColor: OB.wash, color: OB.muted }}>
        We could not read your menu just yet, so type your best sellers below. We read it again when we build your store.
      </p>
    )
  }
  return null
}

export function BestSellersStep({ draft, update, eyebrow, read }: StepProps & { eyebrow: string; read: MenuReadView }) {
  const dishes = read.dishes.slice(0, MAX_CHIPS)
  const hasDishes = read.status === 'done' && dishes.length > 0
  const [isTyping, setIsTyping] = useState(false)
  const picked = draft.bestSellers.filter((name) => name.trim())
  const rankOf = (dish: MenuReadDish) => picked.findIndex((name) => fold(name) === fold(dish.name)) + 1
  const showInputs = !hasDishes || isTyping

  return (
    <div className="space-y-7">
      <QuestionHeading
        eyebrow={eyebrow}
        title="Which are your best sellers?"
        lede="Tap up to 3. We feature them on your menu and build your combos and stamp-card reward around them."
      />

      <ReadingNote status={read.status} />

      {hasDishes && (
        <div role="group" aria-label="Dishes on your menu" className="flex flex-wrap gap-2.5">
          {dishes.map((dish) => (
            <DishChip
              key={dish.name}
              dish={dish}
              rank={rankOf(dish)}
              isFull={picked.length >= MAX_BEST_SELLERS}
              onToggle={() => update({ bestSellers: toggleBestSeller(draft.bestSellers, dish.name) })}
            />
          ))}
        </div>
      )}

      {hasDishes && (
        <button
          type="button"
          onClick={() => setIsTyping(!isTyping)}
          aria-expanded={isTyping}
          className={`-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`}
          style={{ color: OB.ink }}
        >
          Not on the list? Type it
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isTyping ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}

      {showInputs && (
        <div className="space-y-3">
          {draft.bestSellers.map((name, index) => (
            <div key={index} className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold tabular-nums" style={{ color: ACCENT }} aria-hidden>
                {index + 1}
              </span>
              <input
                className={`${INPUT_CLASS} pl-10`}
                value={name}
                maxLength={80}
                aria-label={`Best seller ${index + 1}`}
                placeholder={RANK_PLACEHOLDERS[index]}
                onChange={(event) => {
                  const next = [...draft.bestSellers] as WizardDraft['bestSellers']
                  next[index] = event.target.value
                  update({ bestSellers: next })
                }}
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-[13px] leading-relaxed" style={{ color: OB.muted }}>Not sure yet? Skip this. You can mark best sellers in your menu anytime.</p>
    </div>
  )
}
