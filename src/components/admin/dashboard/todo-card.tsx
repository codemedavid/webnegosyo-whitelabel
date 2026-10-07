import Link from 'next/link'
import { ChevronRight, CircleCheck, Clock3, Gift, ListTodo, Smartphone, Stamp, UserRoundX, type LucideIcon } from 'lucide-react'
import type { ReachableAudience } from '@/lib/dashboard/read-customer-signals'
import type { GrowthAction, GrowthActionKey } from './dashboard-copy'
import { formatCount } from './dashboard-format'
import { DashCard } from './dash-card'

const ICONS: Readonly<Record<GrowthActionKey, LucideIcon>> = {
  'reward-ready': Gift,
  slipping: Clock3,
  'first-timers': UserRoundX,
  'almost-there': Stamp,
  capture: Smartphone,
  'stamp-card': Stamp,
}

/** People to reach get the coral chip; tips about the store's own habits stay neutral. */
const TIP_KEYS: ReadonlySet<GrowthActionKey> = new Set(['capture', 'stamp-card'])
/** A to-do list longer than this stops being glanceable. */
const MAX_ITEMS = 4

function ActionRow({ action }: { action: GrowthAction }) {
  const Icon = ICONS[action.key]
  const chip = TIP_KEYS.has(action.key) ? 'bg-wn-sand text-foreground' : 'bg-wn-coral-wash text-wn-coral-deep'
  const content = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${chip}`} aria-hidden>
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold leading-snug">{action.title}</span>
        <span className="block text-[12.5px] leading-snug text-muted-foreground">{action.detail}</span>
      </span>
      {action.href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  )
  const rowClass = 'flex items-center gap-3 rounded-xl px-2 py-2.5'
  if (!action.href) return <div className={rowClass}>{content}</div>
  return (
    <Link
      href={action.href}
      className={`${rowClass} transition-colors hover:bg-wn-sand focus-visible:bg-wn-sand focus-visible:outline-none`}
    >
      {content}
    </Link>
  )
}

interface TodoCardProps {
  actions: GrowthAction[]
  reachable: ReachableAudience | null
  className?: string
}

/** What to do today to bring customers back, most valuable first. */
export function TodoCard({ actions, reachable, className }: TodoCardProps) {
  const visible = actions.slice(0, MAX_ITEMS)
  return (
    <DashCard
      title="To do"
      icon={ListTodo}
      className={className}
      aside={
        reachable && (
          <span className="text-[12.5px] font-semibold text-muted-foreground">
            {formatCount(reachable.reachable)} can be texted
          </span>
        )
      }
    >
      {visible.length > 0 ? (
        <ul className="-mx-2 space-y-0.5">
          {visible.map((action) => (
            <li key={action.key}>
              <ActionRow action={action} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-3 rounded-xl bg-wn-sand px-4 py-4 text-[14px] font-semibold">
          <CircleCheck className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
          All caught up. Nobody is waiting on you.
        </p>
      )}
    </DashCard>
  )
}
