'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Loader2, Save, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { CoverPicker } from '@/components/superadmin/announcements/cover-picker'
import { saveCourseAction, setCourseStatusAction } from '@/app/actions/university'
import {
  COURSE_LEVELS,
  COURSE_LEVEL_LABEL,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  parseCourseInput,
  slugify,
  type CourseInput,
  type CourseLevel,
} from '@/lib/university/blocks'
import type { CourseRecord, CourseWithCurriculum } from '@/lib/university/service'
import { CurriculumPanel } from './curriculum-panel'

interface Props {
  initial: CourseWithCurriculum | null
  /** Category labels already in use, offered as suggestions. */
  categories: string[]
}

interface Draft {
  slug: string
  title: string
  description: string
  coverImageUrl: string | null
  level: CourseLevel
  category: string
}

const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'
const LABEL = 'mb-1 block text-xs font-medium text-white/60'
const COVER_FOLDER = '/platform/university/covers'

function draftFrom(record: CourseRecord | null): Draft {
  return {
    slug: record?.slug ?? '',
    title: record?.title ?? '',
    description: record?.description ?? '',
    coverImageUrl: record?.coverImageUrl ?? null,
    level: record?.level ?? 'beginner',
    category: record?.category ?? '',
  }
}

function toInput(draft: Draft): CourseInput {
  const blank = (value: string) => (value.trim() === '' ? null : value.trim())
  return {
    slug: draft.slug.trim(),
    title: draft.title.trim(),
    description: blank(draft.description),
    coverImageUrl: draft.coverImageUrl,
    level: draft.level,
    category: blank(draft.category),
  }
}

export function CourseEditor({ initial, categories }: Props) {
  const router = useRouter()
  const [record, setRecord] = useState<CourseRecord | null>(initial)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial))
  const [isSlugLocked, setIsSlugLocked] = useState(initial ? initial.slug !== slugify(initial.title) : false)
  const [isPending, startTransition] = useTransition()

  const patch = (changes: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...changes }))
  const validation = useMemo(() => parseCourseInput(toInput(draft)), [draft])
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftFrom(record)), [draft, record])
  const isPublished = record?.status === 'published'
  const publishedLessons = initial?.modules.reduce(
    (sum, module) => sum + module.lessons.filter((lesson) => lesson.status === 'published').length,
    0
  ) ?? 0

  const setTitle = (title: string) => patch({ title, ...(isSlugLocked ? {} : { slug: slugify(title) }) })

  const save = (publishAfter: boolean) => {
    if (!validation.ok) {
      toast.error(validation.error)
      return
    }
    startTransition(async () => {
      try {
        const saved = await saveCourseAction(record?.id ?? null, validation.input)
        const final = publishAfter ? await setCourseStatusAction(saved.id, 'published') : saved
        setRecord(final)
        setDraft(draftFrom(final))
        toast.success(publishAfter ? 'Course published' : 'Saved')
        if (!record) router.replace(`/superadmin/university/${final.id}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save')
      }
    })
  }

  const unpublish = () => {
    if (!record) return
    startTransition(async () => {
      try {
        const updated = await setCourseStatusAction(record.id, 'draft')
        setRecord(updated)
        toast.success('Course moved to draft')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to change status')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link href="/superadmin/university" className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            University
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">{draft.title || (record ? 'Untitled course' : 'New course')}</h1>
            {record ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
                  isPublished ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200' : 'border-white/15 bg-white/[0.06] text-white/60',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', isPublished ? 'bg-emerald-400' : 'bg-white/40')} />
                {isPublished ? 'Live' : 'Draft'}
              </span>
            ) : null}
            {isDirty ? <span className="text-[11px] text-amber-300">Unsaved changes</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {record && isPublished ? (
            <Link href={`/university/${record.slug}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/10">
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </Link>
          ) : null}
          {record && isPublished ? (
            <button type="button" onClick={unpublish} disabled={isPending} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50">
              Unpublish
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => save(false)}
            disabled={isPending || (!isDirty && record !== null)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {record ? 'Save' : 'Create course'}
          </button>
          {record && !isPublished ? (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={isPending || !validation.ok}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Publish course
            </button>
          ) : null}
        </div>
      </div>

      {record && isPublished && publishedLessons === 0 ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          This course is published but has no live lessons, so it is hidden from the catalog until one is published.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel>
            <CoverPicker
              url={draft.coverImageUrl}
              onChange={(coverImageUrl) => patch({ coverImageUrl })}
              folder={COVER_FOLDER}
              hint="or click to browse · shown on the course card and page"
            />
            <div className="mt-6">
              <textarea
                value={draft.title}
                onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
                maxLength={MAX_TITLE_LENGTH}
                rows={1}
                placeholder="Course title, e.g. Menu Engineering 101"
                aria-label="Title"
                className="w-full resize-none bg-transparent text-3xl font-bold leading-tight tracking-tight text-white placeholder:text-white/20 focus:outline-none"
              />
              <textarea
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                maxLength={MAX_DESCRIPTION_LENGTH}
                rows={3}
                placeholder="What will a merchant be able to do after this course?"
                aria-label="Description"
                className="mt-2 w-full resize-none bg-transparent text-base leading-relaxed text-white/70 placeholder:text-white/25 focus:outline-none"
              />
            </div>
          </Panel>

          {record ? (
            <CurriculumPanel key={record.id} courseId={record.id} initialModules={initial?.modules ?? []} />
          ) : (
            <Panel>
              <SectionHeader title="Curriculum" subtitle="Create the course first, then add modules and lessons here." />
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel>
            <SectionHeader title="Catalog details" />
            <div className="mt-4 space-y-4">
              <div>
                <span className={LABEL}>Level</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {COURSE_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => patch({ level })}
                      className={cn(
                        'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                        draft.level === level ? 'border-white/40 bg-white text-black' : 'border-white/10 text-white/60 hover:bg-white/10',
                      )}
                    >
                      {COURSE_LEVEL_LABEL[level]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className={LABEL}>Category</span>
                <input
                  value={draft.category}
                  onChange={(e) => patch({ category: e.target.value })}
                  list="university-categories"
                  placeholder="e.g. Getting started"
                  className={FIELD}
                />
                <datalist id="university-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <span className="mt-1 block text-[11px] text-white/40">Courses with the same category sit on one shelf in the catalog.</span>
              </label>
              <label className="block">
                <span className={LABEL}>Course url</span>
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                  <span className="text-white/30">/university/</span>
                  <input
                    value={draft.slug}
                    onChange={(e) => {
                      setIsSlugLocked(true)
                      patch({ slug: slugify(e.target.value).slice(0, 80) || e.target.value.toLowerCase() })
                    }}
                    className="min-w-0 flex-1 bg-transparent text-white focus:outline-none"
                    aria-label="Course slug"
                  />
                </div>
                {record && isPublished && draft.slug !== record.slug ? (
                  <span className="mt-1 block text-[11px] text-amber-300">Changing the url breaks links learners already have.</span>
                ) : null}
              </label>
            </div>
          </Panel>

          {!validation.ok && (draft.title || draft.slug) ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">{validation.error}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
