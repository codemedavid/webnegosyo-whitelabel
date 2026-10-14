'use client'

import { motion } from 'framer-motion'
import { Bike, Check, MessageCircle, MessageSquareText, PackagePlus, Repeat, ShoppingBag, Sparkles, Store, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  CHANNEL_IDS,
  CHANNELS,
  DAILY_ORDERS,
  DAILY_ORDER_IDS,
  GOALS,
  GOAL_IDS,
  TYPICAL_ORDERS,
  TYPICAL_ORDER_IDS,
  buildLaunchPlan,
  type ChannelId,
  type DailyOrders,
  type GoalId,
  type TypicalOrder,
} from '@/lib/onboarding/goals'
import { ACCENT, ACCENT_INK, ACCENT_SOFT, OB, QuestionHeading, TapCard, handleRadioGroupKeyDown } from './onboarding-ui'
import { toggleChannel, toggleGoal } from './wizard-draft'
import { Stagger } from './motion/parts'
import { pickedLabel } from './motion/moments'
import type { StepProps } from './wizard-steps'

/*
 * "About you": what the owner wants, where they are today, and the plan we
 * make from it. Asked before anything about the store, because everything
 * after it is framed around their own answers (commitment & consistency).
 */

const GOAL_ICONS: Record<GoalId, LucideIcon> = {
  ordering: ShoppingBag,
  bigger_orders: PackagePlus,
  regulars: Repeat,
  faster_counter: Zap,
}

const CHANNEL_ICONS: Record<ChannelId, LucideIcon> = {
  walk_in: Store,
  facebook: MessageCircle,
  delivery_apps: Bike,
  text: MessageSquareText,
  not_open: Sparkles,
}

const ICON_CLASS = 'h-5 w-5'

/** The multi-select tally; it ticks over with each pick. */
function PickedCount({ count }: { count: number }) {
  return (
    <p className="-mt-3 text-[13px] font-semibold tabular-nums" style={{ color: count > 0 ? OB.ink : OB.faint }} aria-live="polite">
      <motion.span key={count} className="inline-block" initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
        {pickedLabel(count)}
      </motion.span>
    </p>
  )
}

interface WelcomeProps {
  firstName: string
  businessName: string
  isPaid: boolean
}

const HAVE_READY = ['A photo of your menu', 'Your logo, if you have one', 'Your GCash or Maya number'] as const

export function WelcomeStep({ firstName, businessName, isPaid }: WelcomeProps) {
  const greeting = firstName ? `Mabuhay, ${firstName}!` : 'Mabuhay!'
  return (
    <div>
      {isPaid && (
        <p className="mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold" style={{ backgroundColor: OB.wash, color: OB.ink }}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden><Check className="h-3 w-3" strokeWidth={3.5} /></span>
          Payment received. Salamat!
        </p>
      )}
      <motion.h1 tabIndex={-1} className="text-balance text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[3.25rem]" style={{ color: OB.ink }}
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
        {greeting} Let&apos;s open <span className="relative whitespace-nowrap">{businessName || 'your store'}<motion.span className="absolute inset-x-0 -bottom-1 h-[0.18em] origin-left rounded-full bg-[#E8B23A]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.45, duration: 0.5, ease: [0.16, 1, 0.3, 1] }} aria-hidden /></span>.
      </motion.h1>
      <p className="mt-4 max-w-[30rem] text-[17px] leading-relaxed" style={{ color: OB.muted }}>
        About 5 minutes, mostly taps. You tell us what you want, we set up your store around it.
      </p>
      <div className="mt-9 rounded-2xl border-2 p-5" style={{ borderColor: OB.line }}>
        <p className="text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: OB.faint }}>Have these ready</p>
        <ul className="mt-3 space-y-2.5">
          {HAVE_READY.map((item, index) => (
            <motion.li key={item} className="flex items-center gap-3 text-[15px] font-semibold" style={{ color: OB.ink }}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + index * 0.12, duration: 0.35 }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: OB.lineStrong }} aria-hidden />
              {item}
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}

interface AboutStepProps extends StepProps {
  eyebrow: string
  storeName: string
}

export function GoalsStep({ draft, update, eyebrow, storeName }: AboutStepProps) {
  return (
    <div className="space-y-7">
      <QuestionHeading
        eyebrow={eyebrow}
        title={<>Ano ang gusto n&apos;yong mangyari para sa {storeName || 'store n\'yo'}?</>}
        lede="Piliin lahat ng gusto n'yo. We'll set up your store around them."
      />
      <Stagger role="group" aria-label="Your goals" className="space-y-3">
        {GOAL_IDS.map((goal) => {
          const Icon = GOAL_ICONS[goal]
          return (
            <TapCard
              key={goal}
              isMulti
              icon={<Icon className={ICON_CLASS} strokeWidth={2} />}
              title={GOALS[goal].title}
              description={GOALS[goal].description}
              isSelected={draft.goals.includes(goal)}
              onClick={() => update({ goals: toggleGoal(draft.goals, goal) })}
            />
          )
        })}
      </Stagger>
      <PickedCount count={draft.goals.length} />
    </div>
  )
}

export function ChannelsStep({ draft, update, eyebrow }: AboutStepProps) {
  return (
    <div className="space-y-7">
      <QuestionHeading
        eyebrow={eyebrow}
        title="Saan galing ang orders n'yo ngayon?"
        lede="Pick all that apply. We'll help you put your link where your customers already are."
      />
      <Stagger role="group" aria-label="Where orders come from today" className="space-y-3">
        {CHANNEL_IDS.map((channel) => {
          const Icon = CHANNEL_ICONS[channel]
          return (
            <TapCard
              key={channel}
              isMulti
              icon={<Icon className={ICON_CLASS} strokeWidth={2} />}
              title={CHANNELS[channel].title}
              description={CHANNELS[channel].description}
              isSelected={draft.channels.includes(channel)}
              onClick={() => update({ channels: toggleChannel(draft.channels, channel) })}
            />
          )
        })}
      </Stagger>
      <PickedCount count={draft.channels.length} />
    </div>
  )
}

interface SingleChoiceProps extends AboutStepProps {
  /** Answering moves the wizard on by itself. */
  onAnswered: () => void
}

export function DailyOrdersStep({ draft, update, eyebrow, onAnswered }: SingleChoiceProps) {
  // "Not open yet" is only an answer for a store that said so a screen ago.
  const buckets = DAILY_ORDER_IDS.filter((bucket) => bucket !== 'none' || draft.channels.includes('not_open') || draft.dailyOrders === 'none')
  return (
    <div className="space-y-7">
      <QuestionHeading
        eyebrow={eyebrow}
        title="Ilang orders sa isang normal na araw?"
        lede="A rough guess is fine. It's your before number, so you can see your progress later."
      />
      <Stagger role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="Orders on a normal day" className="space-y-3">
        {buckets.map((bucket: DailyOrders) => (
          <TapCard
            key={bucket}
            title={DAILY_ORDERS[bucket]}
            isSelected={draft.dailyOrders === bucket}
            onClick={() => {
              update({ dailyOrders: bucket })
              onAnswered()
            }}
          />
        ))}
      </Stagger>
    </div>
  )
}

export function TypicalOrderStep({ draft, update, eyebrow, onAnswered }: SingleChoiceProps) {
  return (
    <div className="space-y-7">
      <QuestionHeading
        eyebrow={eyebrow}
        title="Magkano ang usual na order?"
        lede="Per customer, roughly. We use it to pick a stamp-card reward worth coming back for."
      />
      <Stagger role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="A typical order" className="space-y-3">
        {TYPICAL_ORDER_IDS.map((bucket: TypicalOrder) => (
          <TapCard
            key={bucket}
            title={TYPICAL_ORDERS[bucket]}
            isSelected={draft.typicalOrder === bucket}
            onClick={() => {
              update({ typicalOrder: bucket })
              onAnswered()
            }}
          />
        ))}
      </Stagger>
    </div>
  )
}

export function PlanStep({ draft, storeName }: { draft: StepProps['draft']; storeName: string }) {
  const plan = buildLaunchPlan(draft.goals)
  return (
    <div className="space-y-7">
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          {plan.goals.map((goal) => (
            <span key={goal} className="rounded-full px-3 py-1 text-[13px] font-bold" style={{ backgroundColor: ACCENT_SOFT, color: OB.ink, boxShadow: `inset 0 0 0 1.5px ${ACCENT}` }}>
              {goal}
            </span>
          ))}
        </div>
        <h1 tabIndex={-1} className="text-balance text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[2.25rem]" style={{ color: OB.ink }}>
          Here&apos;s your plan for {storeName || 'your store'}
        </h1>
        <p className="mt-2.5 text-base leading-relaxed" style={{ color: OB.muted }}>
          We set all of this up for you. Combos wait for your OK before they go live, and you can change anything later.
        </p>
      </div>
      <ol className="rounded-2xl border-2" style={{ borderColor: OB.line }}>
        {plan.rows.map((row, index) => (
          <motion.li key={`${row.goal}-${row.title}`} className="flex items-start gap-3.5 border-b px-4 py-3.5 last:border-b-0" style={{ borderColor: OB.line }}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + index * 0.18, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums" style={{ backgroundColor: ACCENT, color: ACCENT_INK }} aria-hidden>
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold" style={{ color: OB.ink }}>{row.title}</span>
              <span className="mt-0.5 block text-[13.5px] leading-snug" style={{ color: OB.muted }}>{row.detail}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      {plan.alsoReady && <p className="text-[14px] leading-relaxed" style={{ color: OB.muted }}>{plan.alsoReady}</p>}
    </div>
  )
}
