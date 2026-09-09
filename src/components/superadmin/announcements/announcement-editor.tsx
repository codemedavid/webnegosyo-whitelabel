'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Bell, BellRing, FileText, Loader2, Save, Send, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { saveAnnouncementAction, setAnnouncementStatusAction } from '@/app/actions/announcements'
import {
  parseAnnouncementInput,
  type AnnouncementBlock,
  type AnnouncementInput,
  type AnnouncementKind,
} from '@/lib/announcements/blocks'
import type { AnnouncementRecord, AudienceTenant } from '@/lib/announcements/service'
import { AudiencePicker, ChoiceCard } from './audience-picker'
import { BlockEditor } from './block-editor'
import { CoverPicker } from './cover-picker'
import { AnnouncementPreview } from './announcement-preview'
import { ReadinessCard, type ReadinessItem } from './readiness-card'
import { SendPushButton } from './send-push-button'

interface Props {
  initial: AnnouncementRecord | null
  tenants: AudienceTenant[]
}

interface Draft {
  kind: AnnouncementKind
  title: string
  summary: string
  coverImageUrl: string | null
  blocks: AnnouncementBlock[]
  showPopup: boolean
  audienceTenantIds: string[] | null
  pushTitle: string
  pushBody: string
}

const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'
const LABEL = 'mb-1 block text-xs font-medium text-white/60'
const TITLE_MAX = 200
const SUMMARY_MAX = 500

function draftFrom(record: AnnouncementRecord | null): Draft {
  return {
    kind: record?.kind ?? 'post',
    title: record?.title ?? '',
    summary: record?.summary ?? '',
    coverImageUrl: record?.coverImageUrl ?? null,
    blocks: record?.blocks ?? [],
    showPopup: record?.showPopup ?? true,
    audienceTenantIds: record?.audienceTenantIds ?? null,
    pushTitle: record?.pushTitle ?? '',
    pushBody: record?.pushBody ?? '',
  }
}

function toInput(draft: Draft): AnnouncementInput {
  const blank = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    summary: blank(draft.summary),
    coverImageUrl: draft.coverImageUrl,
    blocks: draft.blocks,
    showPopup: draft.showPopup,
    audienceTenantIds: draft.audienceTenantIds,
    pushTitle: blank(draft.pushTitle),
    pushBody: blank(draft.pushBody),
  }
}

function readinessFor(draft: Draft, tenantCount: number): ReadinessItem[] {
  const hasTitle = draft.title.trim().length > 0
  const textBlocksFilled = draft.blocks.every((b) => (b.type === 'heading' || b.type === 'paragraph' ? b.text.trim().length > 0 : true))
  const hasContent = draft.blocks.length > 0 && textBlocksFilled
  const audience = draft.audienceTenantIds
  const hasAudience = audience === null || audience.length > 0
  const hasPushCopy = draft.pushTitle.trim().length > 0 || draft.pushBody.trim().length > 0

  const items: ReadinessItem[] = [
    { label: 'Title', detail: hasTitle ? draft.title.trim() : 'Give the post a headline', state: hasTitle ? 'done' : 'todo' },
  ]
  if (draft.kind === 'post') {
    items.push({
      label: 'Content',
      detail:
        draft.blocks.length === 0
          ? 'Add at least one block'
          : textBlocksFilled
            ? `${draft.blocks.length} ${draft.blocks.length === 1 ? 'block' : 'blocks'}`
            : 'A heading or paragraph is still empty',
      state: hasContent ? 'done' : 'todo',
    })
  }
  items.push({
    label: 'Audience',
    detail: audience === null ? `Every store (${tenantCount})` : audience.length === 0 ? 'Choose at least one store' : `${audience.length} chosen ${audience.length === 1 ? 'store' : 'stores'}`,
    state: hasAudience ? 'done' : 'todo',
  })
  items.push({
    label: 'Notification copy',
    detail: hasPushCopy ? 'Custom title or body set' : 'Optional — falls back to title and summary',
    state: hasPushCopy ? 'done' : 'optional',
  })
  return items
}

export function AnnouncementEditor({ initial, tenants }: Props) {
  const router = useRouter()
  const [record, setRecord] = useState(initial)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial))
  const [isPending, startTransition] = useTransition()

  const patch = (changes: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...changes }))
  const validation = useMemo(() => parseAnnouncementInput(toInput(draft)), [draft])
  const readiness = useMemo(() => readinessFor(draft, tenants.length), [draft, tenants.length])
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftFrom(record)), [draft, record])

  const save = (publishAfter: boolean) => {
    if (!validation.ok) {
      toast.error(validation.error)
      return
    }
    startTransition(async () => {
      try {
        const saved = await saveAnnouncementAction(record?.id ?? null, validation.input)
        const final = publishAfter ? await setAnnouncementStatusAction(saved.id, 'published') : saved
        setRecord(final)
        toast.success(publishAfter ? 'Published to merchants' : 'Saved')
        if (!record) router.replace(`/superadmin/whats-new/${final.id}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save')
      }
    })
  }

  return (
    <div className="space-y-6">
      <EditorHeader
        record={record}
        title={draft.title}
        isDirty={isDirty}
        isPending={isPending}
        isReady={validation.ok}
        onSave={() => save(false)}
        onPublish={() => save(true)}
        onSent={(count) => record && setRecord({ ...record, pushSentAt: new Date().toISOString(), pushRecipientCount: count })}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard
              icon={FileText}
              title="Post"
              hint="An article merchants open and read"
              isActive={draft.kind === 'post'}
              onClick={() => patch({ kind: 'post' })}
            />
            <ChoiceCard
              icon={Bell}
              title="Notice"
              hint="A push-only heads-up, nothing to open"
              isActive={draft.kind === 'notice'}
              onClick={() => patch({ kind: 'notice' })}
            />
          </div>

          <Panel padding="p-0">
            <div className="p-5 sm:p-6">
              <CoverPicker url={draft.coverImageUrl} onChange={(coverImageUrl) => patch({ coverImageUrl })} />
              <div className="mt-6">
                <textarea
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value.replace(/\n/g, '') })}
                  maxLength={TITLE_MAX}
                  rows={1}
                  placeholder={draft.kind === 'post' ? 'Kitchen Display is here' : 'Scheduled maintenance tonight'}
                  aria-label="Title"
                  className="w-full resize-none bg-transparent text-3xl font-bold leading-tight tracking-tight text-white placeholder:text-white/20 focus:outline-none"
                />
                <textarea
                  value={draft.summary}
                  onChange={(e) => patch({ summary: e.target.value })}
                  maxLength={SUMMARY_MAX}
                  rows={2}
                  placeholder="One or two lines merchants see in the popup, the inbox, and the notification."
                  aria-label="Summary"
                  className="mt-2 w-full resize-none bg-transparent text-base leading-relaxed text-white/70 placeholder:text-white/25 focus:outline-none"
                />
                <div className="mt-1 flex justify-end gap-3 text-[11px] text-white/30">
                  <span>Title {draft.title.length}/{TITLE_MAX}</span>
                  <span>Summary {draft.summary.length}/{SUMMARY_MAX}</span>
                </div>
              </div>
            </div>

            {draft.kind === 'post' ? (
              <div className="border-t border-white/10 p-5 sm:p-6">
                <BlockEditor blocks={draft.blocks} onChange={(blocks) => patch({ blocks })} />
              </div>
            ) : (
              <div className="flex items-start gap-3 border-t border-white/10 p-5 text-sm text-white/60 sm:p-6">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
                <p>
                  Notices have no article. Merchants see the title and summary in the notification and in their What&apos;s New inbox.
                  Switch to <button type="button" onClick={() => patch({ kind: 'post' })} className="font-medium text-white underline-offset-2 hover:underline">Post</button> to write a full update.
                </p>
              </div>
            )}
          </Panel>

          <Panel>
            <SectionHeader icon={BellRing} title="Delivery" subtitle="Who sees it, and how they hear about it." />
            <div className="mt-5 space-y-5">
              {draft.kind === 'post' ? (
                <ToggleRow
                  label="Greet with a popup"
                  hint="Shown once, the next time each merchant opens the app."
                  checked={draft.showPopup}
                  onChange={(showPopup) => patch({ showPopup })}
                />
              ) : null}

              <div>
                <span className={LABEL}>Audience</span>
                <AudiencePicker tenants={tenants} value={draft.audienceTenantIds} onChange={(audienceTenantIds) => patch({ audienceTenantIds })} />
              </div>

              <div>
                <span className={LABEL}>Notification copy</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={draft.pushTitle}
                    onChange={(e) => patch({ pushTitle: e.target.value })}
                    maxLength={TITLE_MAX}
                    className={FIELD}
                    aria-label="Notification title"
                    placeholder={draft.title.trim() || 'Title (defaults to the post title)'}
                  />
                  <input
                    value={draft.pushBody}
                    onChange={(e) => patch({ pushBody: e.target.value })}
                    maxLength={SUMMARY_MAX}
                    className={FIELD}
                    aria-label="Notification body"
                    placeholder={draft.summary.trim() || 'Body (defaults to the summary)'}
                  />
                </div>
                <p className="mt-1.5 text-xs text-white/40">Leave blank to reuse the title and summary. Check the Notification tab in the preview.</p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ReadinessCard
            items={readiness}
            isReady={validation.ok}
            error={validation.ok || readiness.some((item) => item.state === 'todo') ? null : validation.error}
          />
          <AnnouncementPreview
            kind={draft.kind}
            title={draft.title}
            summary={draft.summary.trim() || null}
            coverImageUrl={draft.coverImageUrl}
            blocks={draft.kind === 'post' ? draft.blocks : []}
            showPopup={draft.showPopup}
            pushTitle={draft.pushTitle.trim() || null}
            pushBody={draft.pushBody.trim() || null}
          />
        </div>
      </div>
    </div>
  )
}

function EditorHeader({
  record,
  title,
  isDirty,
  isPending,
  isReady,
  onSave,
  onPublish,
  onSent,
}: {
  record: AnnouncementRecord | null
  title: string
  isDirty: boolean
  isPending: boolean
  isReady: boolean
  onSave: () => void
  onPublish: () => void
  onSent: (count: number) => void
}) {
  const isPublished = record?.status === 'published'
  return (
    <div className="sticky top-0 z-20 -mx-6 -mt-8 border-b border-white/10 bg-black/80 px-6 py-4 backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href="/superadmin/whats-new" className="inline-flex items-center gap-1 text-xs font-medium text-white/50 transition-colors hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            What&apos;s New
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-white">{title.trim() || (record ? 'Untitled' : 'New post')}</h1>
            <StatusPill record={record} />
            {isDirty ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Unsaved changes
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={isPending || (!isDirty && record !== null)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isPublished ? 'Save changes' : 'Save draft'}
          </button>
          {!isPublished ? (
            <button
              type="button"
              onClick={onPublish}
              disabled={isPending || !isReady}
              title={isReady ? undefined : 'Finish the checklist first'}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              Publish
            </button>
          ) : null}
          {record ? <SendPushButton announcement={record} onSent={onSent} size="md" /> : null}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ record }: { record: AnnouncementRecord | null }) {
  if (!record) return null
  const isPublished = record.status === 'published'
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
          isPublished ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.06] text-white/60',
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', isPublished ? 'bg-emerald-400' : 'bg-white/40')} />
        {isPublished ? 'Published' : 'Draft'}
      </span>
      {record.pushSentAt ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-white/60">
          <BellRing className="h-3 w-3" />
          Sent to {record.pushRecipientCount ?? 0}
        </span>
      ) : null}
    </span>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:border-white/20"
    >
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-white/45">{hint}</span>
      </span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-emerald-400' : 'bg-white/15')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}
