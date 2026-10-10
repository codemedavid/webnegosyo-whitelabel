import Link from 'next/link'
import { Play } from 'lucide-react'
import { loadLearnCatalog } from '@/lib/university/learn-data'

/**
 * "▶ 3-min video" beside a page title: the lesson that explains the page,
 * played in the admin's Learn. Renders nothing when the lesson is not
 * published (renamed, drafted) or the catalog cannot be read.
 */
export async function LearnChip({ tenantSlug, lessonSlug }: { tenantSlug: string; lessonSlug: string }) {
  const lesson = await loadLearnCatalog().then((catalog) => catalog.bySlug.get(lessonSlug) ?? null).catch(() => null)
  if (!lesson) return null
  return (
    <Link
      href={`/${tenantSlug}/admin/learn/${lesson.courseSlug}/${lesson.slug}`}
      className="inline-flex min-h-9 items-center gap-2 rounded-full bg-wn-ink py-1 pl-1 pr-3 text-[12px] font-bold text-white transition-colors hover:bg-wn-ink-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral focus-visible:ring-offset-2"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E8B23A] text-wn-ink" aria-hidden>
        <Play className="h-3.5 w-3.5 translate-x-px fill-current" />
      </span>
      {lesson.durationMinutes ? `${lesson.durationMinutes}-min video` : 'Video'}: {lesson.title}
    </Link>
  )
}
