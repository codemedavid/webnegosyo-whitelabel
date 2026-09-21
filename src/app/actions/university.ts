'use server'

/**
 * Superadmin server actions for SmartMenu University.
 *
 * Server Actions are public POST endpoints whatever the page gate says, so
 * every one asserts the superadmin role itself before touching the
 * service-role client. Input crosses the boundary as `unknown` and is parsed
 * by the shared content model before it reaches the database. Every write
 * purges the public portal's cache tag.
 */
import { revalidatePath, revalidateTag } from 'next/cache'
import { getCurrentUserRole } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  parseCourseInput,
  parseLessonInput,
  parseModuleInput,
  slugify,
} from '@/lib/university/blocks'
import { UNIVERSITY_CACHE_TAG } from '@/lib/university/public-reads'
import {
  createCourse,
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  getCourseById,
  getLesson,
  listCourses,
  reorderCourses,
  reorderLessons,
  reorderModules,
  setCourseStatus,
  setLessonStatus,
  updateCourse,
  updateLesson,
  updateModule,
  type CourseRecord,
  type CourseSummary,
  type CourseWithCurriculum,
  type LessonRecord,
  type ModuleRecord,
  type PublishStatus,
} from '@/lib/university/service'

const LIST_PATH = '/superadmin/university'

async function assertSuperadmin(): Promise<void> {
  const role = (await getCurrentUserRole()) as { role?: string } | null
  if (!role || role.role !== 'superadmin') {
    throw new Error('Forbidden: Superadmin access required')
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function purge(courseId?: string): void {
  revalidateTag(UNIVERSITY_CACHE_TAG)
  revalidatePath(LIST_PATH)
  if (courseId) revalidatePath(`${LIST_PATH}/${courseId}`)
}

// -----------------------------------------------------------------------------
// Courses
// -----------------------------------------------------------------------------

export async function listCoursesAction(): Promise<CourseSummary[]> {
  await assertSuperadmin()
  return listCourses(createAdminClient())
}

export async function getCourseAction(id: string): Promise<CourseWithCurriculum | null> {
  await assertSuperadmin()
  return getCourseById(createAdminClient(), id)
}

export async function saveCourseAction(id: string | null, input: unknown): Promise<CourseRecord> {
  await assertSuperadmin()
  const parsed = parseCourseInput(input)
  if (!parsed.ok) throw new Error(parsed.error)
  const admin = createAdminClient()
  const saved = id
    ? await updateCourse(admin, id, parsed.input)
    : await createCourse(admin, parsed.input, await currentUserId())
  purge(saved.id)
  return saved
}

export async function setCourseStatusAction(id: string, status: PublishStatus): Promise<CourseRecord> {
  await assertSuperadmin()
  const updated = await setCourseStatus(createAdminClient(), id, status)
  purge(id)
  return updated
}

export async function deleteCourseAction(id: string): Promise<void> {
  await assertSuperadmin()
  await deleteCourse(createAdminClient(), id)
  purge()
}

export async function reorderCoursesAction(ids: string[]): Promise<void> {
  await assertSuperadmin()
  await reorderCourses(createAdminClient(), ids)
  purge()
}

// -----------------------------------------------------------------------------
// Modules
// -----------------------------------------------------------------------------

export async function createModuleAction(courseId: string, input: unknown): Promise<ModuleRecord> {
  await assertSuperadmin()
  const parsed = parseModuleInput(input)
  if (!parsed.ok) throw new Error(parsed.error)
  const created = await createModule(createAdminClient(), courseId, parsed.input)
  purge(courseId)
  return created
}

export async function updateModuleAction(courseId: string, id: string, input: unknown): Promise<ModuleRecord> {
  await assertSuperadmin()
  const parsed = parseModuleInput(input)
  if (!parsed.ok) throw new Error(parsed.error)
  const updated = await updateModule(createAdminClient(), id, parsed.input)
  purge(courseId)
  return updated
}

export async function deleteModuleAction(courseId: string, id: string): Promise<void> {
  await assertSuperadmin()
  await deleteModule(createAdminClient(), id)
  purge(courseId)
}

export async function reorderModulesAction(courseId: string, ids: string[]): Promise<void> {
  await assertSuperadmin()
  await reorderModules(createAdminClient(), courseId, ids)
  purge(courseId)
}

// -----------------------------------------------------------------------------
// Lessons
// -----------------------------------------------------------------------------

export async function getLessonAction(id: string): Promise<LessonRecord | null> {
  await assertSuperadmin()
  return getLesson(createAdminClient(), id)
}

/**
 * A new lesson is created as a titled draft straight from the curriculum
 * panel, then opened in the editor. The slug is derived from the title and
 * suffixed until it is unique within the course.
 */
export async function createLessonAction(courseId: string, moduleId: string, title: string): Promise<LessonRecord> {
  await assertSuperadmin()
  const admin = createAdminClient()
  const course = await getCourseById(admin, courseId)
  if (!course) throw new Error('Course not found')
  const taken = new Set(course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.slug)))
  const base = slugify(title) || 'lesson'
  let slug = base
  for (let attempt = 2; taken.has(slug); attempt += 1) slug = `${base}-${attempt}`

  const parsed = parseLessonInput({
    slug,
    title,
    summary: null,
    videoUrl: null,
    durationMinutes: null,
    blocks: [{ type: 'paragraph', text: 'Write the lesson here.' }],
    resources: [],
  })
  if (!parsed.ok) throw new Error(parsed.error)
  const created = await createLesson(admin, courseId, moduleId, parsed.input)
  purge(courseId)
  return created
}

export async function saveLessonAction(id: string, input: unknown): Promise<LessonRecord> {
  await assertSuperadmin()
  const parsed = parseLessonInput(input)
  if (!parsed.ok) throw new Error(parsed.error)
  const saved = await updateLesson(createAdminClient(), id, parsed.input)
  purge(saved.courseId)
  return saved
}

export async function setLessonStatusAction(id: string, status: PublishStatus): Promise<LessonRecord> {
  await assertSuperadmin()
  const updated = await setLessonStatus(createAdminClient(), id, status)
  purge(updated.courseId)
  return updated
}

export async function deleteLessonAction(courseId: string, id: string): Promise<void> {
  await assertSuperadmin()
  await deleteLesson(createAdminClient(), id)
  purge(courseId)
}

export async function reorderLessonsAction(courseId: string, moduleId: string, ids: string[]): Promise<void> {
  await assertSuperadmin()
  await reorderLessons(createAdminClient(), moduleId, ids)
  purge(courseId)
}
