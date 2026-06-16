import Link from 'next/link'
import { BarChart3, Plus, Store, Zap, type LucideIcon } from 'lucide-react'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'

interface QuickAction {
  href: string
  label: string
  description: string
  icon: LucideIcon
  primary?: boolean
}

const ACTIONS: QuickAction[] = [
  {
    href: '/superadmin/tenants/new',
    label: 'Add restaurant',
    description: 'Onboard a new merchant',
    icon: Plus,
    primary: true,
  },
  {
    href: '/superadmin/analytics',
    label: 'View analytics',
    description: 'Platform activity & leaders',
    icon: BarChart3,
  },
  {
    href: '/superadmin/tenants',
    label: 'Manage restaurants',
    description: 'Browse & edit all tenants',
    icon: Store,
  },
]

/** Quick navigation shortcuts for common superadmin tasks. */
export function QuickActions() {
  return (
    <Panel>
      <SectionHeader icon={Zap} title="Quick actions" />
      <div className="mt-4 grid gap-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className={
                action.primary
                  ? 'group flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-black transition-colors hover:bg-white/90'
                  : 'group flex items-center gap-3 rounded-xl border border-white/15 px-3 py-2.5 text-white transition-colors hover:bg-white/10'
              }
            >
              <span
                className={
                  action.primary
                    ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/10'
                    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]'
                }
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{action.label}</span>
                <span
                  className={
                    action.primary
                      ? 'block text-xs leading-tight text-black/55'
                      : 'block text-xs leading-tight text-white/45'
                  }
                >
                  {action.description}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </Panel>
  )
}
