import Link from 'next/link'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  describeSectionStatus,
  type SettingStatus,
  type SettingsEntry,
  type SettingsGroup,
  type SettingsTenantFacts,
} from '@/lib/settings/settings-catalog'
import { SettingsIcon } from './settings-icon'
import { SettingStatusLabel } from './setting-status'

interface SettingsOverviewProps {
  storeName: string
  catalog: SettingsGroup[]
  tenant: SettingsTenantFacts
  accountEmail: string | null
}

interface ResolvedEntry {
  entry: SettingsEntry
  status: SettingStatus | null
}

/**
 * The Settings front page: every thing this viewer can set up, grouped by
 * topic, each with its current state, so "what can I manage here?" is
 * answered before anything is opened.
 */
export function SettingsOverview({ storeName, catalog, tenant, accountEmail }: SettingsOverviewProps) {
  const groups = catalog.map((group) => ({
    ...group,
    resolved: group.entries.map(
      (entry): ResolvedEntry => ({
        entry,
        status: entry.section ? describeSectionStatus(entry.section, tenant, { accountEmail }) : null,
      })
    ),
  }))
  const needsAttention = groups.flatMap((group) =>
    group.resolved.filter((item) => item.status?.tone === 'attention')
  )

  return (
    <div className="max-w-3xl space-y-8 pb-10">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-muted-foreground">
          Everything you can set up for {storeName}. Open a topic to change it.
        </p>
      </header>

      {needsAttention.length > 0 && <AttentionNotice items={needsAttention} />}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`settings-group-${group.key}`} className="space-y-2.5">
          <h2 id={`settings-group-${group.key}`} className="px-1 text-sm font-semibold text-muted-foreground">
            {group.title}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {group.resolved.map((item) => (
              <li key={item.entry.key}>
                <SettingsRow {...item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function SettingsRow({ entry, status }: ResolvedEntry) {
  const isTool = entry.kind === 'tool'
  const isDestructive = entry.key === 'data'

  return (
    <Link
      href={entry.href}
      className={cn(
        'group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/50',
        'focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          isDestructive ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground/75'
        )}
      >
        <SettingsIcon name={entry.icon} className="h-[18px] w-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug">{entry.title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{entry.summary}</span>
        {status && <SettingStatusLabel status={status} className="mt-1.5 max-w-full sm:hidden" />}
      </span>

      {status && <SettingStatusLabel status={status} className="hidden max-w-[14rem] shrink-0 sm:inline-flex" />}

      {isTool ? (
        <>
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden
          />
          <span className="sr-only">(opens its own page)</span>
        </>
      ) : (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      )}
    </Link>
  )
}

function AttentionNotice({ items }: { items: ResolvedEntry[] }) {
  const count = items.length
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3.5">
      <p className="text-sm font-semibold">
        {count === 1 ? '1 thing to finish setting up' : `${count} things to finish setting up`}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
        {items.map(({ entry, status }) => (
          <li key={entry.key}>
            <Link
              href={entry.href}
              className="text-sm text-foreground/80 underline decoration-amber-500/50 underline-offset-4 hover:text-foreground hover:decoration-amber-500"
            >
              {entry.title}
              {status && <span className="text-muted-foreground"> — {status.label.toLowerCase()}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
