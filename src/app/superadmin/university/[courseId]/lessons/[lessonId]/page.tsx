import { notFound } from 'next/navigation'
import { LessonEditor } from '@/components/superadmin/university/lesson-editor'
import { getCourseAction, getLessonAction } from '@/app/actions/university'

export const dynamic = 'force-dynamic'

export default async function EditLessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params
  const [course, lesson] = await Promise.all([getCourseAction(courseId), getLessonAction(lessonId)])
  if (!course || !lesson || lesson.courseId !== course.id) notFound()
  return <LessonEditor course={course} initial={lesson} />
}
