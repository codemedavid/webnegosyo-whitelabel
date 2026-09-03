'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ImagePlus, Save, X } from 'lucide-react'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { saveAnnouncementAction, setAnnouncementStatusAction } from '@/app/actions/announcements'
import { uploadImageToImageKit } from '@/lib/imagekit-upload'
import {
  parseAnnouncementInput,
  type AnnouncementBlock,
  type AnnouncementInput,
  type AnnouncementKind,
} from '@/lib/announcements/blocks'
import type { AnnouncementRecord, AudienceTenant } from '@/lib/announcements/service'
import { BlockEditor } from './block-editor'
import { AnnouncementPreview } from './announcement-preview'
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
const COVER_FOLDER = '/platform/whats-new/covers'

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

export function AnnouncementEditor({ initial, tenants }: Props) {
  const router = useRouter()
  const [record, setRecord] = useState(initial)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial))
  const [isPending, startTransition] = useTransition()
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)

  const patch = (changes: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...changes }))
  const validation = useMemo(() => parseAnnouncementInput(toInput(draft)), [draft])

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

  const uploadCover = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsUploadingCover(true)
    try {
      const uploaded = await uploadImageToImageKit(file, { folder: COVER_FOLDER })
      patch({ coverImageUrl: uploaded.url })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploadingCover(false)
    }
  }

  const toggleTenant = (id: string) => {
    const current = draft.audienceTenantIds ?? []
    const next = current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
    patch({ audienceTenantIds: next })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Panel>
          <SectionHeader title="Post" subtitle="What merchants read." />
          <div className="mt-4 space-y-4">
            <div className="flex gap-2">
              {(['post', 'notice'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => patch({ kind })}
                  className={
                    draft.kind === kind
                      ? 'rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black'
                      : 'rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10'
                  }
                >
                  {kind === 'post' ? 'Post (article)' : 'Notice (push only)'}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="ann-title" className={LABEL}>Title</label>
              <input id="ann-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} maxLength={200} className={FIELD} placeholder="Kitchen Display is here" />
            </div>
            <div>
              <label htmlFor="ann-summary" className={LABEL}>Summary</label>
              <textarea id="ann-summary" value={draft.summary} onChange={(e) => patch({ summary: e.target.value })} maxLength={500} rows={2} className={FIELD} placeholder="One or two lines shown on the list and in the popup." />
            </div>
            <div>
              <span className={LABEL}>Cover image</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => coverInput.current?.click()} disabled={isUploadingCover} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50">
                  <ImagePlus className="h-3.5 w-3.5" />
                  {isUploadingCover ? 'Uploading…' : draft.coverImageUrl ? 'Replace' : 'Upload'}
                </button>
                {draft.coverImageUrl ? (
                  <button type="button" onClick={() => patch({ coverImageUrl: null })} className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white">
                    <X className="h-3 w-3" /> Remove
                  </button>
                ) : null}
              </div>
              <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={uploadCover} />
            </div>
            {draft.kind === 'post' ? (
              <div>
                <span className={LABEL}>Content</span>
                <BlockEditor blocks={draft.blocks} onChange={(blocks) => patch({ blocks })} />
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Delivery" subtitle="Who sees it and how they hear about it." />
          <div className="mt-4 space-y-4">
            {draft.kind === 'post' ? (
              <label className="flex items-center gap-3 text-sm text-white">
                <input type="checkbox" checked={draft.showPopup} onChange={(e) => patch({ showPopup: e.target.checked })} className="h-4 w-4 accent-white" />
                Greet merchants with a popup the next time they open the app
              </label>
            ) : null}
            <div>
              <span className={LABEL}>Audience</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => patch({ audienceTenantIds: null })} className={draft.audienceTenantIds === null ? 'rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black' : 'rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10'}>
                  All stores
                </button>
                <button type="button" onClick={() => patch({ audienceTenantIds: draft.audienceTenantIds ?? [] })} className={draft.audienceTenantIds !== null ? 'rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black' : 'rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10'}>
                  Chosen stores
                </button>
              </div>
              {draft.audienceTenantIds !== null ? (
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-2">
                  {tenants.map((tenant) => (
                    <label key={tenant.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-white/80 hover:bg-white/5">
                      <input type="checkbox" checked={draft.audienceTenantIds?.includes(tenant.id) ?? false} onChange={() => toggleTenant(tenant.id)} className="h-4 w-4 accent-white" />
                      <span className="truncate">{tenant.name}</span>
                      <span className="ml-auto text-xs text-white/40">{tenant.slug}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ann-push-title" className={LABEL}>Notification title (optional)</label>
                <input id="ann-push-title" value={draft.pushTitle} onChange={(e) => patch({ pushTitle: e.target.value })} maxLength={200} className={FIELD} placeholder="Defaults to the post title" />
              </div>
              <div>
                <label htmlFor="ann-push-body" className={LABEL}>Notification body (optional)</label>
                <input id="ann-push-body" value={draft.pushBody} onChange={(e) => patch({ pushBody: e.target.value })} maxLength={500} className={FIELD} placeholder="Defaults to the summary" />
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => save(false)} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50">
            <Save className="h-4 w-4" /> Save {record?.status === 'published' ? 'changes' : 'draft'}
          </button>
          {record?.status !== 'published' ? (
            <button type="button" onClick={() => save(true)} disabled={isPending} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50">
              Save &amp; publish
            </button>
          ) : null}
          {record ? (
            <SendPushButton announcement={record} onSent={(count) => setRecord({ ...record, pushSentAt: new Date().toISOString(), pushRecipientCount: count })} />
          ) : null}
          {!validation.ok && draft.title ? <span className="text-xs text-amber-300">{validation.error}</span> : null}
        </div>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">Phone preview</p>
        <AnnouncementPreview title={draft.title} summary={draft.summary || null} coverImageUrl={draft.coverImageUrl} blocks={draft.kind === 'post' ? draft.blocks : []} />
      </div>
    </div>
  )
}
