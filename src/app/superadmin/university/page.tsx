import Link from 'next/link'
import { BookOpen, Clock, GraduationCap, Layers, Plus } from 'lucide-react'
import { KpiCard, PageHeader } from '@/components/superadmin/ui/primitives'
import { CourseList } from '@/components/superadmin/university/course-list'
import { listCoursesAction } from '@/app/actions/university'

export const dynamic = 'force-dynamic'

export default async function UniversityPage() {
  const courses = await listCoursesAction()
  const live = courses.filter((course) => course.status === 'published' && course.publishedLessonCount > 0)
  const lessons = courses.reduce((sum, course) => sum + course.lessonCount, 0)
  const liveLessons = courses.reduce((sum, course) => sum + course.publishedLessonCount, 0)
  const minutes = courses.reduce((sum, course) => sum + course.totalMinutes, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public portal"
        title="SmartMenu University"
        subtitle="Courses, modules and lessons anyone can open at /university. Publish a course and at least one lesson to list it."
        actions={
          <>
            <Link href="/university" target="_blank" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10">
              Open portal
            </Link>
            <Link href="/superadmin/university/new" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90">
              <Plus className="h-4 w-4" />
              New course
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Live courses" value={live.length} icon={GraduationCap} hint={`${courses.length - live.length} not yet listed`} />
        <KpiCard label="Lessons" value={lessons} icon={Layers} hint={`${liveLessons} published`} />
        <KpiCard label="Content" value={minutes ? `${Math.round(minutes / 60)}h ${minutes % 60}m` : '—'} icon={Clock} hint="Sum of lesson durations" />
        <KpiCard label="Courses" value={courses.length} icon={BookOpen} hint="Drafts included" />
      </div>

      <CourseList initialItems={courses} />
    </div>
  )
}
