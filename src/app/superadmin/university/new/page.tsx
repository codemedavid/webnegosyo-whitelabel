import { CourseEditor } from '@/components/superadmin/university/course-editor'
import { listCoursesAction } from '@/app/actions/university'

export const dynamic = 'force-dynamic'

export default async function NewCoursePage() {
  const courses = await listCoursesAction()
  const categories = [...new Set(courses.map((course) => course.category).filter((c): c is string => Boolean(c)))]
  return <CourseEditor initial={null} categories={categories} />
}
