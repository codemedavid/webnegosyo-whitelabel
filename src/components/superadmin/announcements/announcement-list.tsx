'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bell, Eye, FileText, Megaphone, Trash2 } from 'lucide-react'
import { Panel, EmptyState } from '@/components/superadmin/ui/primitives'
import { deleteAnnouncementAction, setAnnouncementStatusAction } from '@/app/actions/announcements'
import type { AnnouncementSummary } from '@/lib/announcements/service'
import { SendPushButton } from './send-push-button'

interface Props {
  initialItems: AnnouncementSummary[]
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function AnnouncementList({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [isPending, startTransition] = useTransition()

  const replace = (updated: AnnouncementSummary) =>
    setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))

  const toggleStatus = (item: AnnouncementSummary) => {
    const next = item.status === 'published' ? 'draft' : 'published'
    startTransition(async () => {
      try {
        const updated = await setAnnouncementStatusAction(item.id, next)
        replace({ ...updated, readCount: item.readCount })
        toast.success(next === 'published' ? 'Published to merchants' : 'Moved back to draft')
      } catch (error) {
        toast.error(errorMessage(error, 'Failed to change status'))
      }
    })
  }

  const remove = (item: AnnouncementSummary) => {
    if (!window.confirm(`Delete "${item.title}"? Merchants will no longer see it.`)) return
    startTransition(async () => {
      try {
        await deleteAnnouncementAction(item.id)
        setItems((prev) => prev.filter((row) => row.id !== item.id))
        toast.success('Deleted')
      } catch (error) {
        toast.error(errorMessage(error, 'Failed to delete'))
      }
    })
  }

  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={Megaphone}
          title="Nothing written yet"
          description="Your first post greets every merchant the next time they open the app."
        />
      </Panel>
    )
  }

  return (
    <Panel padding="p-0">
      <ul className="divide-y divide-white/10">
        {items.map((item) => {
          const KindIcon = item.kind === 'notice' ? Bell : FileText
          const isPublished = item.status === 'published'
          return (
            <li key={item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                  <KindIcon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/superadmin/whats-new/${item.id}`}
                    className="block truncate text-sm font-semibold text-white hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
                    <span
                      className={
                        isPublished
                          ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300'
                          : 'rounded-full bg-white/10 px-2 py-0.5 text-white/60'
                      }
                    >
                      {isPublished ? `Published ${formatDate(item.publishedAt)}` : 'Draft'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {item.readCount} read
                    </span>
                    <span>
                      {item.pushSentAt
                        ? `Pushed to ${item.pushRecipientCount ?? 0} devices on ${formatDate(item.pushSentAt)}`
                        : 'Not pushed'}
                    </span>
                    <span>{item.audienceTenantIds ? `${item.audienceTenantIds.length} stores` : 'All stores'}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleStatus(item)}
                  disabled={isPending}
                  className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <SendPushButton
                  announcement={item}
                  onSent={(count) => replace({ ...item, pushSentAt: new Date().toISOString(), pushRecipientCount: count })}
                />
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={isPending}
                  aria-label={`Delete ${item.title}`}
                  className="rounded-xl p-2 text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
