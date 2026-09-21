'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Clock, ExternalLink, Loader2, Paperclip, Save, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { saveLessonAction, setLessonStatusAction } from '@/app/actions/university'
import {
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  parseLessonInput,
  slugify,
  type LessonBlock,
  type LessonInput,
  type LessonResource,
} from '@/lib/university/blocks'
import type { CourseRecord, LessonRecord } from '@/lib/university/service'
import { LessonBlockEditor } from './lesson-block-editor'
import { ResourcePanel } from './resource-panel'
import { VideoField } from './video-field'

interface Props {
  course: CourseRecord
  initial: LessonRecord
}

interface Draft {
  slug: string
  title: string
  summary: string
  videoUrl: string
  durationMinutes: string
  blocks: LessonBlock[]
  resources: LessonResource[]
}

const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'
const LABEL = 'mb-1 block text-xs font-medium text-white/60'

function draftFrom(record: LessonRecord): Draft {
  return {
    slug: record.slug,
    title: record.title,
    summary: record.summary ?? '',
    videoUrl: record.videoUrl ?? '',
    durationMinutes: record.durationMinutes === null ? '' : String(record.durationMinutes),
    blocks: record.blocks,
    resources: record.resources,
  }
}

function toInput(draft: Draft): LessonInput {
  const blank = (value: string) => (value.trim() === '' ? null : value.trim())
  const minutes = draft.durationMinutes.trim()
  return {
    slug: draft.slug.trim(),
    title: draft.title.trim(),
    summary: blank(draft.summary),
    videoUrl: blank(draft.videoUrl),
    durationMinutes: minutes === '' ? null : Number(minutes),
    blocks: draft.blocks,
    resources: draft.resources,
  }
}

export function LessonEditor({ course, initial }: Props) {
  const [record, setRecord] = useState(initial)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial))
  const [isSlugLocked, setIsSlugLocked] = useState(initial.slug !== slugify(initial.title))
  const [isPending, startTransition] = useTransition()

  const patch = (changes: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...changes }))
  const validation = useMemo(() => parseLessonInput(toInput(draft)), [draft])
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftFrom(record)), [draft, record])
  const isPublished = record.status === 'published'
  const publicHref = `/university/${course.slug}/${record.slug}`

  const setTitle = (title: string) => patch({ title, ...(isSlugLocked ? {} : { slug: slugify(title) }) })

  const save = (publishAfter: boolean) => {
    if (!validation.ok) {
      toast.error(validation.error)
      return
    }
    startTransition(async () => {
      try {
        const saved = await saveLessonAction(record.id, validation.input)
        const final = publishAfter ? await setLessonStatusAction(saved.id, 'published') : saved
        setRecord(final)
        setDraft(draftFrom(final))
        toast.success(publishAfter ? 'Lesson published' : 'Saved')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save')
      }
    })
  }

  const unpublish = () => {
    startTransition(async () => {
      try {
        const updated = await setLessonStatusAction(record.id, 'draft')
        setRecord(updated)
        toast.success('Moved back to draft')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to change status')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link href={`/superadmin/university/${course.id}`} className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            {course.title}
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">{draft.title || 'Untitled lesson'}</h1>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
                isPublished ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200' : 'border-white/15 bg-white/[0.06] text-white/60',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', isPublished ? 'bg-emerald-400' : 'bg-white/40')} />
              {isPublished ? 'Live' : 'Draft'}
            </span>
            {isDirty ? <span className="text-[11px] text-amber-300">Unsaved changes</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isPublished && course.status === 'published' ? (
            <Link href={publicHref} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/10">
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </Link>
          ) : null}
          {isPublished ? (
            <button type="button" onClick={unpublish} disabled={isPending} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50">
              Unpublish
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => save(false)}
            disabled={isPending || !isDirty}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
          {!isPublished ? (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={isPending || !validation.ok}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Publish lesson
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel>
            <textarea
              value={draft.title}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
              maxLength={MAX_TITLE_LENGTH}
              rows={1}
              placeholder="Lesson title"
              aria-label="Title"
              className="w-full resize-none bg-transparent text-3xl font-bold leading-tight tracking-tight text-white placeholder:text-white/20 focus:outline-none"
            />
            <textarea
              value={draft.summary}
              onChange={(e) => patch({ summary: e.target.value })}
              maxLength={MAX_SUMMARY_LENGTH}
              rows={2}
              placeholder="One or two lines that tell the learner what this lesson covers."
              aria-label="Summary"
              className="mt-2 w-full resize-none bg-transparent text-base leading-relaxed text-white/70 placeholder:text-white/25 focus:outline-none"
            />
            <div className="mt-4">
              <VideoField value={draft.videoUrl} onChange={(videoUrl) => patch({ videoUrl })} />
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Lesson content" subtitle="Shown under the video, or as the whole lesson when there is none." />
            <div className="mt-5">
              <LessonBlockEditor blocks={draft.blocks} onChange={(blocks) => patch({ blocks })} />
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <SectionHeader icon={Clock} title="Details" />
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={LABEL}>Duration (minutes)</span>
                <input
                  value={draft.durationMinutes}
                  onChange={(e) => patch({ durationMinutes: e.target.value.replace(/[^0-9]/g, '') })}
                  inputMode="numeric"
                  placeholder="e.g. 8"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className={LABEL}>Lesson url</span>
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                  <span className="truncate text-white/30">/{course.slug}/</span>
                  <input
                    value={draft.slug}
                    onChange={(e) => {
                      setIsSlugLocked(true)
                      patch({ slug: slugify(e.target.value).slice(0, 80) || e.target.value.toLowerCase() })
                    }}
                    className="min-w-0 flex-1 bg-transparent text-white focus:outline-none"
                    aria-label="Lesson slug"
                  />
                </div>
                {isPublished && draft.slug !== record.slug ? (
                  <span className="mt-1 block text-[11px] text-amber-300">Changing the url breaks links learners already have.</span>
                ) : null}
              </label>
            </div>
          </Panel>

          <Panel>
            <SectionHeader icon={Paperclip} title="Resources" subtitle="Documents and links for this lesson." />
            <div className="mt-4">
              <ResourcePanel resources={draft.resources} onChange={(resources) => patch({ resources })} />
            </div>
          </Panel>

          {!validation.ok ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">{validation.error}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
