import { GraduationCap, PlayCircle, Sparkles } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { CourseCard, formatMinutes } from '@/components/university/course-card'
import { getPublishedCourses } from '@/lib/university/public-reads'
import type { CourseSummary } from '@/lib/university/service'

export const revalidate = 300

const UNSHELVED = 'More courses'

/** Courses grouped by category in catalog order; uncategorised ones last. */
function shelves(courses: CourseSummary[]): { label: string; courses: CourseSummary[] }[] {
  const order: string[] = []
  const byLabel = new Map<string, CourseSummary[]>()
  for (const course of courses) {
    const label = course.category ?? UNSHELVED
    if (!byLabel.has(label)) {
      byLabel.set(label, [])
      order.push(label)
    }
    byLabel.get(label)?.push(course)
  }
  return [...order.filter((label) => label !== UNSHELVED), ...order.filter((label) => label === UNSHELVED)].map((label) => ({
    label,
    courses: byLabel.get(label) ?? [],
  }))
}

export default async function UniversityHomePage() {
  const courses = await getPublishedCourses()
  const lessonCount = courses.reduce((sum, course) => sum + course.publishedLessonCount, 0)
  const minutes = courses.reduce((sum, course) => sum + course.totalMinutes, 0)
  const groups = shelves(courses)

  return (
    <>
      <section className="relative overflow-hidden" style={{ backgroundColor: SMARTMENU.ink }}>
        <div className="graph absolute inset-0 opacity-[0.35]" style={{ backgroundImage: `linear-gradient(#FFF7EE12 1px, transparent 1px), linear-gradient(90deg, #FFF7EE12 1px, transparent 1px)` }} />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-30 blur-3xl" style={{ backgroundColor: SMARTMENU.amber }} />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full opacity-20 blur-3xl" style={{ backgroundColor: SMARTMENU.red }} />
        <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ borderColor: '#FFF7EE33', color: SMARTMENU.amber }}>
            <GraduationCap className="h-3.5 w-3.5" />
            Free for every food business
          </span>
          <h1 className="font-display t-hero mt-6 max-w-3xl font-bold text-white">
            Learn to sell more with <span style={{ color: SMARTMENU.amber }}>SmartMenu</span>.
          </h1>
          <p className="font-serif mt-5 max-w-2xl text-lg italic md:text-xl" style={{ color: SMARTMENU.parchment }}>
            Short video lessons and guides on setting up your online menu, engineering it to raise your average order, and running your store day to day.
          </p>
          {courses.length > 0 ? (
            <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-4">
              <Stat value={String(courses.length)} label={courses.length === 1 ? 'course' : 'courses'} />
              <Stat value={String(lessonCount)} label={lessonCount === 1 ? 'lesson' : 'lessons'} />
              {minutes > 0 ? <Stat value={formatMinutes(minutes)} label="of content" /> : null}
            </dl>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8">
        {courses.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-white/60 px-6 py-20 text-center" style={{ borderColor: `${SMARTMENU.ink}33` }}>
            <Sparkles className="mx-auto h-10 w-10" style={{ color: SMARTMENU.amber }} />
            <h2 className="font-display mt-4 text-2xl font-bold" style={{ color: SMARTMENU.ink }}>
              First courses coming soon
            </h2>
            <p className="mt-2 text-sm" style={{ color: SMARTMENU.cocoa }}>
              We are recording the first lessons now. Check back shortly.
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {groups.map((group) => (
              <section key={group.label}>
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SMARTMENU.red }}>
                      Shelf
                    </p>
                    <h2 className="font-display t-title font-bold" style={{ color: SMARTMENU.ink }}>
                      {group.label}
                    </h2>
                  </div>
                  <span className="hidden items-center gap-1.5 text-sm font-semibold sm:inline-flex" style={{ color: SMARTMENU.cocoa }}>
                    <PlayCircle className="h-4 w-4" />
                    {group.courses.length} {group.courses.length === 1 ? 'course' : 'courses'}
                  </span>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {group.courses.map((course) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="shrink-0 whitespace-nowrap">
      <dt className="font-display text-3xl font-bold text-white">{value}</dt>
      <dd className="mt-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.parchment }}>
        {label}
      </dd>
    </div>
  )
}
