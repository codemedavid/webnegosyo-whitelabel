'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, BookOpen, Clock, GraduationCap, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState, Panel } from '@/components/superadmin/ui/primitives'
import { deleteCourseAction, reorderCoursesAction, setCourseStatusAction } from '@/app/actions/university'
import { COURSE_LEVEL_LABEL } from '@/lib/university/blocks'
import type { CourseSummary } from '@/lib/university/service'

interface Props {
  initialItems: CourseSummary[]
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function swap<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function CourseList({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [isPending, startTransition] = useTransition()

  const toggleStatus = (item: CourseSummary) => {
    const status = item.status === 'published' ? 'draft' : 'published'
    startTransition(async () => {
      try {
        const updated = await setCourseStatusAction(item.id, status)
        setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...updated } : row)))
        toast.success(status === 'published' ? 'Course published' : 'Course moved to draft')
      } catch (error) {
        toast.error(errorMessage(error, 'Failed to change status'))
      }
    })
  }

  const remove = (item: CourseSummary) => {
    if (!window.confirm(`Delete "${item.title}" and its ${item.lessonCount} lesson${item.lessonCount === 1 ? '' : 's'}?`)) return
    startTransition(async () => {
      try {
        await deleteCourseAction(item.id)
        setItems((prev) => prev.filter((row) => row.id !== item.id))
        toast.success('Course deleted')
      } catch (error) {
        toast.error(errorMessage(error, 'Failed to delete'))
      }
    })
  }

  const move = (index: number, to: number) => {
    const next = swap(items, index, to)
    if (next === items) return
    setItems(next)
    startTransition(async () => {
      try {
        await reorderCoursesAction(next.map((row) => row.id))
      } catch (error) {
        toast.error(errorMessage(error, 'Failed to reorder'))
      }
    })
  }

  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          description="Create the first course, add modules and lessons, then publish it to the public portal."
          action={
            <Link href="/superadmin/university/new" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
              <Plus className="h-4 w-4" />
              Create a course
            </Link>
          }
        />
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => {
        const isPublished = item.status === 'published'
        const isListed = isPublished && item.publishedLessonCount > 0
        return (
          <Panel key={item.id} padding="p-0" hover className="flex flex-col overflow-hidden">
            <Link href={`/superadmin/university/${item.id}`} className="group relative block aspect-[16/9] w-full overflow-hidden bg-white/[0.03]">
              {item.coverImageUrl ? (
                <img src={item.coverImageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(80%_120%_at_50%_0%,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_70%)]">
                  <BookOpen className="h-8 w-8 text-white/20" />
                </div>
              )}
              <div className="absolute left-3 top-3 flex items-center gap-1.5">
                <span className="rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
                  {COURSE_LEVEL_LABEL[item.level]}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest backdrop-blur',
                    isListed ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200' : isPublished ? 'border-amber-400/30 bg-amber-500/20 text-amber-200' : 'border-white/15 bg-black/60 text-white/70',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', isListed ? 'bg-emerald-400' : isPublished ? 'bg-amber-400' : 'bg-white/40')} />
                  {isListed ? 'Live' : isPublished ? 'No live lessons' : 'Draft'}
                </span>
              </div>
            </Link>

            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="min-w-0">
                {item.category ? <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{item.category}</p> : null}
                <Link href={`/superadmin/university/${item.id}`} className="line-clamp-2 text-base font-semibold leading-snug text-white hover:underline">
                  {item.title}
                </Link>
                <p className="mt-1 truncate text-xs text-white/45">/university/{item.slug}</p>
              </div>

              <dl className="grid grid-cols-2 gap-2">
                <Stat icon={Layers} label="Lessons" value={`${item.publishedLessonCount} live / ${item.lessonCount}`} />
                <Stat icon={Clock} label="Length" value={item.totalMinutes ? `${item.totalMinutes} min` : '—'} />
              </dl>

              <div className="mt-auto flex items-center gap-2 pt-1">
                <Link href={`/superadmin/university/${item.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10">
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
                <div className="ml-auto flex items-center">
                  <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0 || isPending} aria-label="Move up" className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => move(index, index + 1)} disabled={index === items.length - 1 || isPending} aria-label="Move down" className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(item)} disabled={isPending} aria-label={`Delete ${item.title}`} className="rounded-md p-1.5 text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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
