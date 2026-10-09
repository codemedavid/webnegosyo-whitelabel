/**
 * "Where a human is still needed": one group per stuck step, oldest first,
 * each lead linking to its panel on Checkout Leads.
 */

import Link from 'next/link'
import { CheckCircle2, Hand } from 'lucide-react'
import { EmptyState, Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'
import { formatDuration } from '@/lib/sales-pipeline/format-duration'
import type { AttentionGroup, AttentionItem } from '@/lib/sales-pipeline/needs-attention'

/** Per group; the rest are one click away on Checkout Leads. */
const MAX_ITEMS_PER_GROUP = 8

function AttentionRow({ item, nowMs }: { item: AttentionItem; nowMs: number }) {
  const waited = formatDuration(nowMs - item.sinceMs)
  return (
    <li>
      <Link
        href={`/superadmin/checkout-leads?lead=${item.lead.id}`}
        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
      >
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{item.lead.businessName}</p>
          <p className="truncate text-xs text-white/45">
            {item.lead.referenceNumber} · {item.lead.contactName}
            {item.detail ? ` · ${item.detail}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums ${
            item.isOverdue
              ? 'border-red-400/20 bg-red-400/10 text-red-300'
              : 'border-white/10 bg-white/[0.06] text-white/60'
          }`}
        >
          {waited}
        </span>
      </Link>
    </li>
  )
}

function GroupBlock({ group, nowMs }: { group: AttentionGroup; nowMs: number }) {
  const hidden = group.items.length - MAX_ITEMS_PER_GROUP
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <header className="flex items-start justify-between gap-3 px-3 pt-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{group.label}</h3>
          <p className="text-xs text-white/45">{group.action}</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-white/55">
          {formatNumber(group.items.length)}
          {group.overdueCount > 0 ? <span className="text-red-300"> · {group.overdueCount} overdue</span> : null}
        </span>
      </header>
      <ul className="mt-2 space-y-0.5">
        {group.items.slice(0, MAX_ITEMS_PER_GROUP).map((item) => (
          <AttentionRow key={item.lead.id} item={item} nowMs={nowMs} />
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="px-3 pt-2 text-xs text-white/40">
          +{formatNumber(hidden)} more on{' '}
          <Link href="/superadmin/checkout-leads" className="underline underline-offset-2 hover:text-white">
            Checkout Leads
          </Link>
        </p>
      ) : null}
    </section>
  )
}

export function NeedsAttentionPanel({ groups, nowMs }: { groups: AttentionGroup[]; nowMs: number }) {
  return (
    <Panel padding="p-6">
      <SectionHeader
        icon={Hand}
        title="Where a human is still needed"
        subtitle="Every lead waiting on staff or the owner. Badges show how long it has waited; red is overdue."
      />
      {groups.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nobody is waiting on a human" description="Every lead in this view is moving on its own." />
      ) : (
        <div className="mt-5 space-y-3">
          {groups.map((group) => (
            <GroupBlock key={group.kind} group={group} nowMs={nowMs} />
          ))}
        </div>
      )}
    </Panel>
  )
}
