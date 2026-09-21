import { notFound } from 'next/navigation'
import { CourseEditor } from '@/components/superadmin/university/course-editor'
import { getCourseAction, listCoursesAction } from '@/app/actions/university'

export const dynamic = 'force-dynamic'

export default async function EditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const [course, courses] = await Promise.all([getCourseAction(courseId), listCoursesAction()])
  if (!course) notFound()
  const categories = [...new Set(courses.map((row) => row.category).filter((c): c is string => Boolean(c)))]
  return <CourseEditor key={course.updatedAt} initial={course} categories={categories} />
}
