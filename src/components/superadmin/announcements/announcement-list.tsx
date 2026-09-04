'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bell, BellRing, Eye, FileText, Megaphone, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
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
          action={
            <Link href="/superadmin/whats-new/new" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
              <Plus className="h-4 w-4" />
              Write the first post
            </Link>
          }
        />
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => {
        const isPublished = item.status === 'published'
        const isNotice = item.kind === 'notice'
        const KindIcon = isNotice ? Bell : FileText
        return (
          <Panel key={item.id} padding="p-0" hover className="flex flex-col overflow-hidden">
            <Link
              href={`/superadmin/whats-new/${item.id}`}
              className={cn('group relative block w-full overflow-hidden bg-white/[0.03]', item.coverImageUrl ? 'aspect-[21/9]' : 'aspect-[4/1]')}
            >
              {item.coverImageUrl ? (
                <img src={item.coverImageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(80%_120%_at_50%_0%,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_70%)]">
                  <KindIcon className="h-8 w-8 text-white/20" />
                </div>
              )}
              <div className="absolute left-3 top-3 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
                  <KindIcon className="h-3 w-3" />
                  {isNotice ? 'Notice' : 'Post'}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest backdrop-blur',
                    isPublished ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200' : 'border-white/15 bg-black/60 text-white/70',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', isPublished ? 'bg-emerald-400' : 'bg-white/40')} />
                  {isPublished ? 'Live' : 'Draft'}
                </span>
              </div>
            </Link>

            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="min-w-0">
                <Link href={`/superadmin/whats-new/${item.id}`} className="line-clamp-2 text-base font-semibold leading-snug text-white hover:underline">
                  {item.title}
                </Link>
                <p className="mt-1 text-xs text-white/45">
                  {isPublished ? `Published ${formatDate(item.publishedAt)}` : `Last edited ${formatDate(item.updatedAt)}`}
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-2">
                <Stat icon={Eye} label="Reads" value={String(item.readCount)} />
                <Stat
                  icon={BellRing}
                  label={item.pushSentAt ? `Sent ${formatDate(item.pushSentAt)}` : 'Push'}
                  value={item.pushSentAt ? String(item.pushRecipientCount ?? 0) : '—'}
                />
                <Stat icon={Users} label="Audience" value={item.audienceTenantIds ? `${item.audienceTenantIds.length} stores` : 'All'} />
              </dl>

              <div className="mt-auto flex items-center gap-2 pt-1">
                <Link
                  href={`/superadmin/whats-new/${item.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
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
                  className="ml-auto rounded-xl p-2 text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/40">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-white">{value}</dd>
    </div>
  )
}
