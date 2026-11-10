import { GraduationCap, Wand2 } from 'lucide-react'
import { BONUS_SECTION, HELPED } from './funnel-copy'
import { BONUSES, formatPeso, type FunnelBonus } from './funnel-offer'
import { CtaLink } from './funnel-ui'

const BONUS_ICONS = [Wand2, GraduationCap] as const

/** The reference's bonus row: glowing tile, serif eyebrow, ~~worth~~ FREE, body, a tag. */
function BonusCard({ bonus, index }: { bonus: FunnelBonus; index: number }) {
  const Icon = BONUS_ICONS[index] ?? Wand2
  return (
    <li className="fn-card flex items-start gap-4 p-5 sm:gap-5 sm:p-6">
      <span className="fn-tile">
        <Icon aria-hidden className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="fn-eyebrow-serif">{bonus.label}</p>
          <p className="fn-worth flex items-baseline gap-1.5">
            {bonus.value !== undefined && <span className="fn-worth-old">{formatPeso(bonus.value)}</span>}
            <span className="fn-free">{BONUS_SECTION.free}</span>
          </p>
        </div>
        <h3 className="mt-1 text-[clamp(17px,2.3vw,20px)] font-bold leading-tight tracking-[-0.015em] text-white">{bonus.title}</h3>
        <p className="fn-body mt-1.5">{bonus.detail}</p>
        <p className={`fn-tag mt-4 ${bonus.isSixMonthOnly ? 'fn-tag--red' : ''}`}>
          <span aria-hidden className="fn-dot" />
          {bonus.tag}
        </p>
      </div>
    </li>
  )
}

export function FunnelBonuses() {
  return (
    <section className="px-5 py-20">
      <div className="mx-auto max-w-[720px]">
        <h2 className="fn-h2 fn-serif text-center !font-normal !tracking-[-0.01em]">{BONUS_SECTION.title}</h2>
        <ul className="mt-10 space-y-4">
          {BONUSES.map((bonus, index) => (
            <BonusCard key={bonus.title} bonus={bonus} index={index} />
          ))}
        </ul>
        <div className="mt-10">
          <CtaLink size="large">{BONUS_SECTION.cta}</CtaLink>
        </div>

        <div className="mt-20 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{HELPED.eyebrow}</p>
          <p className="fn-stat-value mt-2">
            {HELPED.value} {HELPED.unit}
          </p>
          <p className="mt-3 text-[15px] font-medium tracking-[0.01em] text-[#BFB2A2]">{HELPED.caption}</p>
        </div>
      </div>
    </section>
  )
}
