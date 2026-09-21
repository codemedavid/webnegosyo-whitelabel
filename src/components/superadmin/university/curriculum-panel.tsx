'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, FileText, Layers, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState, Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import {
  createLessonAction,
  createModuleAction,
  deleteLessonAction,
  deleteModuleAction,
  reorderLessonsAction,
  reorderModulesAction,
  setLessonStatusAction,
  updateModuleAction,
} from '@/app/actions/university'
import { lessonKind } from '@/lib/university/blocks'
import type { LessonListItem, ModuleWithLessons } from '@/lib/university/service'

interface Props {
  courseId: string
  initialModules: ModuleWithLessons[]
}

const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'

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

/**
 * The course's chapters and lessons, edited in place: add a module, rename
 * it, add a lesson (created as a draft and opened in the editor), reorder
 * either with the arrows, publish or delete a lesson from the row. Order
 * changes are applied optimistically and persisted per module.
 */
export function CurriculumPanel({ courseId, initialModules }: Props) {
  const [modules, setModules] = useState(initialModules)
  const [isAddingModule, setIsAddingModule] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [isPending, startTransition] = useTransition()

  const run = (work: () => Promise<void>, fallback: string) =>
    startTransition(async () => {
      try {
        await work()
      } catch (error) {
        toast.error(errorMessage(error, fallback))
      }
    })

  const addModule = () => {
    const title = newModuleTitle.trim()
    if (!title) return
    run(async () => {
      const created = await createModuleAction(courseId, { title, description: null })
      setModules((prev) => [...prev, { ...created, lessons: [] }])
      setNewModuleTitle('')
      setIsAddingModule(false)
    }, 'Failed to add module')
  }

  const renameModule = (id: string, title: string, description: string | null) =>
    run(async () => {
      const updated = await updateModuleAction(courseId, id, { title, description })
      setModules((prev) => prev.map((module) => (module.id === id ? { ...module, ...updated } : module)))
      toast.success('Module updated')
    }, 'Failed to rename module')

  const removeModule = (module: ModuleWithLessons) => {
    const lessonNote = module.lessons.length ? ` and its ${module.lessons.length} lesson${module.lessons.length === 1 ? '' : 's'}` : ''
    if (!window.confirm(`Delete "${module.title}"${lessonNote}?`)) return
    run(async () => {
      await deleteModuleAction(courseId, module.id)
      setModules((prev) => prev.filter((row) => row.id !== module.id))
      toast.success('Module deleted')
    }, 'Failed to delete module')
  }

  const moveModule = (index: number, to: number) => {
    const next = swap(modules, index, to)
    if (next === modules) return
    setModules(next)
    run(() => reorderModulesAction(courseId, next.map((module) => module.id)), 'Failed to reorder modules')
  }

  const addLesson = (moduleId: string, title: string) =>
    run(async () => {
      const created = await createLessonAction(courseId, moduleId, title)
      setModules((prev) =>
        prev.map((module) => (module.id === moduleId ? { ...module, lessons: [...module.lessons, created] } : module))
      )
      toast.success('Lesson created — open it to add the video and content')
    }, 'Failed to add lesson')

  const moveLesson = (moduleId: string, index: number, to: number) => {
    const target = modules.find((row) => row.id === moduleId)
    if (!target) return
    const nextLessons = swap(target.lessons, index, to)
    if (nextLessons === target.lessons) return
    setModules((prev) => prev.map((row) => (row.id === moduleId ? { ...row, lessons: nextLessons } : row)))
    run(() => reorderLessonsAction(courseId, moduleId, nextLessons.map((lesson) => lesson.id)), 'Failed to reorder lessons')
  }

  const toggleLesson = (lesson: LessonListItem) => {
    const status = lesson.status === 'published' ? 'draft' : 'published'
    run(async () => {
      const updated = await setLessonStatusAction(lesson.id, status)
      setModules((prev) =>
        prev.map((module) => ({
          ...module,
          lessons: module.lessons.map((row) => (row.id === lesson.id ? { ...row, status: updated.status } : row)),
        }))
      )
      toast.success(status === 'published' ? 'Lesson published' : 'Lesson moved to draft')
    }, 'Failed to change status')
  }

  const removeLesson = (lesson: LessonListItem) => {
    if (!window.confirm(`Delete "${lesson.title}"?`)) return
    run(async () => {
      await deleteLessonAction(courseId, lesson.id)
      setModules((prev) =>
        prev.map((module) => ({ ...module, lessons: module.lessons.filter((row) => row.id !== lesson.id) }))
      )
      toast.success('Lesson deleted')
    }, 'Failed to delete lesson')
  }

  return (
    <Panel>
      <SectionHeader
        icon={Layers}
        title="Curriculum"
        subtitle="Modules are the chapters; lessons are what learners open."
        action={
          !isAddingModule ? (
            <button type="button" onClick={() => setIsAddingModule(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10">
              <Plus className="h-3.5 w-3.5" />
              Add module
            </button>
          ) : null
        }
      />

      <div className="mt-5 space-y-4">
        {modules.length === 0 && !isAddingModule ? (
          <EmptyState
            icon={Layers}
            title="No modules yet"
            description="Start with a module like “Getting started”, then add lessons to it."
            action={
              <button type="button" onClick={() => setIsAddingModule(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
                <Plus className="h-4 w-4" />
                Add the first module
              </button>
            }
          />
        ) : null}

        {modules.map((module, index) => (
          <ModuleCard
            key={module.id}
            module={module}
            index={index}
            isFirst={index === 0}
            isLast={index === modules.length - 1}
            isPending={isPending}
            courseId={courseId}
            onRename={(title, description) => renameModule(module.id, title, description)}
            onRemove={() => removeModule(module)}
            onMoveUp={() => moveModule(index, index - 1)}
            onMoveDown={() => moveModule(index, index + 1)}
            onAddLesson={(title) => addLesson(module.id, title)}
            onMoveLesson={(lessonIndex, to) => moveLesson(module.id, lessonIndex, to)}
            onToggleLesson={toggleLesson}
            onRemoveLesson={removeLesson}
          />
        ))}

        {isAddingModule ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/25 bg-white/[0.04] p-3">
            <input
              autoFocus
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addModule()
                if (e.key === 'Escape') setIsAddingModule(false)
              }}
              placeholder="Module title, e.g. Getting started"
              className={FIELD}
            />
            <button type="button" onClick={addModule} disabled={isPending || !newModuleTitle.trim()} className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50">
              Add
            </button>
            <button type="button" onClick={() => setIsAddingModule(false)} className="rounded-xl px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white">
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}

function ModuleCard({
  module,
  index,
  isFirst,
  isLast,
  isPending,
  courseId,
  onRename,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddLesson,
  onMoveLesson,
  onToggleLesson,
  onRemoveLesson,
}: {
  module: ModuleWithLessons
  index: number
  isFirst: boolean
  isLast: boolean
  isPending: boolean
  courseId: string
  onRename: (title: string, description: string | null) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddLesson: (title: string) => void
  onMoveLesson: (lessonIndex: number, to: number) => void
  onToggleLesson: (lesson: LessonListItem) => void
  onRemoveLesson: (lesson: LessonListItem) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(module.title)
  const [description, setDescription] = useState(module.description ?? '')
  const [isAddingLesson, setIsAddingLesson] = useState(false)
  const [lessonTitle, setLessonTitle] = useState('')

  const submitRename = () => {
    if (!title.trim()) return
    onRename(title.trim(), description.trim() === '' ? null : description.trim())
    setIsEditing(false)
  }

  const submitLesson = () => {
    if (!lessonTitle.trim()) return
    onAddLesson(lessonTitle.trim())
    setLessonTitle('')
    setIsAddingLesson(false)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/70">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="space-y-2">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitRename()} className={FIELD} aria-label="Module title" />
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" className={FIELD} aria-label="Module description" />
              <div className="flex gap-2">
                <button type="button" onClick={submitRename} className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90">
                  <Check className="h-3.5 w-3.5" />
                  Save
                </button>
                <button type="button" onClick={() => setIsEditing(false)} className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">{module.title}</p>
              {module.description ? <p className="mt-0.5 text-xs text-white/50">{module.description}</p> : null}
              <p className="mt-1 text-[11px] text-white/40">
                {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'} ·{' '}
                {module.lessons.filter((lesson) => lesson.status === 'published').length} live
              </p>
            </>
          )}
        </div>
        {!isEditing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Move module up" onClick={onMoveUp} disabled={isFirst || isPending}>
              <ArrowUp className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Move module down" onClick={onMoveDown} disabled={isLast || isPending}>
              <ArrowDown className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Edit module" onClick={() => setIsEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Delete module" onClick={onRemove} disabled={isPending} danger>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        {module.lessons.length === 0 && !isAddingLesson ? (
          <p className="py-2 text-center text-xs text-white/40">No lessons in this module yet.</p>
        ) : null}
        <ul className="space-y-1.5">
          {module.lessons.map((lesson, lessonIndex) => {
            const isLive = lesson.status === 'published'
            const KindIcon = lessonKind(lesson) === 'video' ? Play : FileText
            return (
              <li key={lesson.id} className="group/lesson flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/20">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/60">
                  <KindIcon className="h-3.5 w-3.5" />
                </span>
                <Link href={`/superadmin/university/${courseId}/lessons/${lesson.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white group-hover/lesson:underline">{lesson.title}</span>
                  <span className="block text-[11px] text-white/40">
                    {lessonKind(lesson) === 'video' ? 'Video' : 'Article'}
                    {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => onToggleLesson(lesson)}
                  disabled={isPending}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition-colors disabled:opacity-50',
                    isLive ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30' : 'border-white/15 bg-white/[0.06] text-white/60 hover:bg-white/10',
                  )}
                  title={isLive ? 'Click to unpublish' : 'Click to publish'}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'bg-emerald-400' : 'bg-white/40')} />
                  {isLive ? 'Live' : 'Draft'}
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton label="Move lesson up" onClick={() => onMoveLesson(lessonIndex, lessonIndex - 1)} disabled={lessonIndex === 0 || isPending}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="Move lesson down" onClick={() => onMoveLesson(lessonIndex, lessonIndex + 1)} disabled={lessonIndex === module.lessons.length - 1 || isPending}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="Delete lesson" onClick={() => onRemoveLesson(lesson)} disabled={isPending} danger>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ul>

        {isAddingLesson ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitLesson()
                if (e.key === 'Escape') setIsAddingLesson(false)
              }}
              placeholder="Lesson title, e.g. Setting up your first menu"
              className={FIELD}
            />
            <button type="button" onClick={submitLesson} disabled={isPending || !lessonTitle.trim()} className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50">
              Create
            </button>
            <button type="button" onClick={() => setIsAddingLesson(false)} className="rounded-xl px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setIsAddingLesson(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white">
            <Plus className="h-3.5 w-3.5" />
            Add lesson
          </button>
        )}
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'rounded-md p-1.5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30'
          : 'rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30'
      }
    >
      {children}
    </button>
  )
}
