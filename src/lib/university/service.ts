/**
 * Reads and writes for SmartMenu University.
 *
 * Every function takes the client it should use: the superadmin server
 * actions hand in the service-role client (authorization already asserted
 * by the action), the public pages hand in the anonymous client (RLS shows
 * published rows only), and tests hand in a fake. Rows are mapped to
 * camelCase records at this boundary so no caller sees a raw table row.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import {
  parseLessonBlocks,
  parseLessonResources,
  type CourseInput,
  type CourseLevel,
  type LessonBlock,
  type LessonInput,
  type LessonResource,
  type ModuleInput,
} from './blocks'

type Client = SupabaseClient<Database>
type CourseRow = Database['public']['Tables']['university_courses']['Row']
type ModuleRow = Database['public']['Tables']['university_modules']['Row']
type LessonRow = Database['public']['Tables']['university_lessons']['Row']

export type PublishStatus = 'draft' | 'published'

export interface CourseRecord {
  id: string
  slug: string
  title: string
  description: string | null
  coverImageUrl: string | null
  level: CourseLevel
  category: string | null
  sortOrder: number
  status: PublishStatus
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ModuleRecord {
  id: string
  courseId: string
  title: string
  description: string | null
  sortOrder: number
}

export interface LessonRecord {
  id: string
  courseId: string
  moduleId: string
  slug: string
  title: string
  summary: string | null
  videoUrl: string | null
  durationMinutes: number | null
  blocks: LessonBlock[]
  resources: LessonResource[]
  status: PublishStatus
  sortOrder: number
  updatedAt: string
}

/** A lesson as the curriculum lists it: everything but the body. */
export type LessonListItem = Omit<LessonRecord, 'blocks' | 'resources'>

export interface ModuleWithLessons extends ModuleRecord {
  lessons: LessonListItem[]
}

export interface CourseWithCurriculum extends CourseRecord {
  modules: ModuleWithLessons[]
}

export interface CourseSummary extends CourseRecord {
  lessonCount: number
  publishedLessonCount: number
  totalMinutes: number
}

function toStatus(value: string): PublishStatus {
  return value === 'published' ? 'published' : 'draft'
}

function toLevel(value: string): CourseLevel {
  return value === 'intermediate' || value === 'advanced' ? value : 'beginner'
}

export function toCourseRecord(row: CourseRow): CourseRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    level: toLevel(row.level),
    category: row.category,
    sortOrder: row.sort_order,
    status: toStatus(row.status),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toModuleRecord(row: ModuleRow): ModuleRecord {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
  }
}

function toLessonListItem(row: LessonRow): LessonListItem {
  return {
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    videoUrl: row.video_url,
    durationMinutes: row.duration_minutes,
    status: toStatus(row.status),
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
}

export function toLessonRecord(row: LessonRow): LessonRecord {
  const blocks = parseLessonBlocks(row.blocks)
  const resources = parseLessonResources(row.resources)
  return {
    ...toLessonListItem(row),
    // A body that fails validation is shown as empty rather than thrown on:
    // the editor can still open the row and repair it.
    blocks: blocks.ok ? blocks.blocks : [],
    resources: resources.ok ? resources.resources : [],
  }
}

const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder

/** Attach each module's lessons (in order) to its module (in order). */
export function assembleCurriculum(modules: ModuleRecord[], lessons: LessonListItem[]): ModuleWithLessons[] {
  return [...modules].sort(bySortOrder).map((module) => ({
    ...module,
    lessons: lessons.filter((lesson) => lesson.moduleId === module.id).sort(bySortOrder),
  }))
}

function fail(action: string, message: string): never {
  throw new Error(`Failed to ${action}: ${message}`)
}

// -----------------------------------------------------------------------------
// Courses
// -----------------------------------------------------------------------------

/** Every course the client may see, in catalog order, with lesson counts. */
export async function listCourses(client: Client): Promise<CourseSummary[]> {
  const { data, error } = await client
    .from('university_courses')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) fail('load courses', error.message)
  const courses = (data ?? []).map(toCourseRecord)
  if (courses.length === 0) return []

  const { data: lessons, error: lessonsError } = await client
    .from('university_lessons')
    .select('course_id, status, duration_minutes')
    .in(
      'course_id',
      courses.map((course) => course.id)
    )
  if (lessonsError) fail('load lesson counts', lessonsError.message)

  return courses.map((course) => {
    const own = (lessons ?? []).filter((lesson) => lesson.course_id === course.id)
    return {
      ...course,
      lessonCount: own.length,
      publishedLessonCount: own.filter((lesson) => lesson.status === 'published').length,
      totalMinutes: own.reduce((sum, lesson) => sum + (lesson.duration_minutes ?? 0), 0),
    }
  })
}

async function loadCurriculum(client: Client, course: CourseRecord): Promise<CourseWithCurriculum> {
  const [modulesResult, lessonsResult] = await Promise.all([
    client.from('university_modules').select('*').eq('course_id', course.id),
    client
      .from('university_lessons')
      .select('id, course_id, module_id, slug, title, summary, video_url, duration_minutes, status, sort_order, updated_at')
      .eq('course_id', course.id),
  ])
  if (modulesResult.error) fail('load modules', modulesResult.error.message)
  if (lessonsResult.error) fail('load lessons', lessonsResult.error.message)
  const modules = (modulesResult.data ?? []).map(toModuleRecord)
  const lessons = (lessonsResult.data ?? []).map((row) => toLessonListItem(row as LessonRow))
  return { ...course, modules: assembleCurriculum(modules, lessons) }
}

export async function getCourseById(client: Client, id: string): Promise<CourseWithCurriculum | null> {
  const { data, error } = await client.from('university_courses').select('*').eq('id', id).maybeSingle()
  if (error) fail('load course', error.message)
  return data ? loadCurriculum(client, toCourseRecord(data)) : null
}

export async function getCourseBySlug(client: Client, slug: string): Promise<CourseWithCurriculum | null> {
  const { data, error } = await client.from('university_courses').select('*').eq('slug', slug).maybeSingle()
  if (error) fail('load course', error.message)
  return data ? loadCurriculum(client, toCourseRecord(data)) : null
}

function toCourseInsert(input: CourseInput) {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description,
    cover_image_url: input.coverImageUrl,
    level: input.level,
    category: input.category,
  }
}

export async function createCourse(client: Client, input: CourseInput, createdBy: string | null): Promise<CourseRecord> {
  const { data: last } = await client
    .from('university_courses')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await client
    .from('university_courses')
    .insert({ ...toCourseInsert(input), created_by: createdBy, sort_order: (last?.sort_order ?? -1) + 1 })
    .select('*')
    .single()
  if (error) fail('create course', error.message)
  return toCourseRecord(data)
}

export async function updateCourse(client: Client, id: string, input: CourseInput): Promise<CourseRecord> {
  const { data, error } = await client
    .from('university_courses')
    .update(toCourseInsert(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) fail('update course', error.message)
  return toCourseRecord(data)
}

export async function setCourseStatus(client: Client, id: string, status: PublishStatus): Promise<CourseRecord> {
  const { data, error } = await client
    .from('university_courses')
    .update({ status, published_at: status === 'published' ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) fail('change course status', error.message)
  return toCourseRecord(data)
}

export async function deleteCourse(client: Client, id: string): Promise<void> {
  const { error } = await client.from('university_courses').delete().eq('id', id)
  if (error) fail('delete course', error.message)
}

/** Persist a new catalog order: index in `ids` becomes the sort order. */
export async function reorderCourses(client: Client, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id, index) => {
      const { error } = await client.from('university_courses').update({ sort_order: index }).eq('id', id)
      if (error) fail('reorder courses', error.message)
    })
  )
}

// -----------------------------------------------------------------------------
// Modules
// -----------------------------------------------------------------------------

export async function createModule(client: Client, courseId: string, input: ModuleInput): Promise<ModuleRecord> {
  const { data: last } = await client
    .from('university_modules')
    .select('sort_order')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await client
    .from('university_modules')
    .insert({ course_id: courseId, title: input.title, description: input.description, sort_order: (last?.sort_order ?? -1) + 1 })
    .select('*')
    .single()
  if (error) fail('create module', error.message)
  return toModuleRecord(data)
}

export async function updateModule(client: Client, id: string, input: ModuleInput): Promise<ModuleRecord> {
  const { data, error } = await client
    .from('university_modules')
    .update({ title: input.title, description: input.description })
    .eq('id', id)
    .select('*')
    .single()
  if (error) fail('update module', error.message)
  return toModuleRecord(data)
}

export async function deleteModule(client: Client, id: string): Promise<void> {
  const { error } = await client.from('university_modules').delete().eq('id', id)
  if (error) fail('delete module', error.message)
}

export async function reorderModules(client: Client, courseId: string, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id, index) => {
      const { error } = await client
        .from('university_modules')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('course_id', courseId)
      if (error) fail('reorder modules', error.message)
    })
  )
}

// -----------------------------------------------------------------------------
// Lessons
// -----------------------------------------------------------------------------

export async function getLesson(client: Client, id: string): Promise<LessonRecord | null> {
  const { data, error } = await client.from('university_lessons').select('*').eq('id', id).maybeSingle()
  if (error) fail('load lesson', error.message)
  return data ? toLessonRecord(data) : null
}

export async function getLessonBySlug(client: Client, courseId: string, slug: string): Promise<LessonRecord | null> {
  const { data, error } = await client
    .from('university_lessons')
    .select('*')
    .eq('course_id', courseId)
    .eq('slug', slug)
    .maybeSingle()
  if (error) fail('load lesson', error.message)
  return data ? toLessonRecord(data) : null
}

function toLessonInsert(input: LessonInput) {
  return {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    video_url: input.videoUrl,
    duration_minutes: input.durationMinutes,
    blocks: input.blocks,
    resources: input.resources,
  }
}

/** A lesson starts as a draft placeholder the editor then fills in. */
export async function createLesson(
  client: Client,
  courseId: string,
  moduleId: string,
  input: LessonInput
): Promise<LessonRecord> {
  const { data: last } = await client
    .from('university_lessons')
    .select('sort_order')
    .eq('module_id', moduleId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await client
    .from('university_lessons')
    .insert({ ...toLessonInsert(input), course_id: courseId, module_id: moduleId, sort_order: (last?.sort_order ?? -1) + 1 })
    .select('*')
    .single()
  if (error) fail('create lesson', error.message)
  return toLessonRecord(data)
}

export async function updateLesson(client: Client, id: string, input: LessonInput): Promise<LessonRecord> {
  const { data, error } = await client
    .from('university_lessons')
    .update(toLessonInsert(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) fail('update lesson', error.message)
  return toLessonRecord(data)
}

export async function setLessonStatus(client: Client, id: string, status: PublishStatus): Promise<LessonRecord> {
  const { data, error } = await client
    .from('university_lessons')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error) fail('change lesson status', error.message)
  return toLessonRecord(data)
}

export async function deleteLesson(client: Client, id: string): Promise<void> {
  const { error } = await client.from('university_lessons').delete().eq('id', id)
  if (error) fail('delete lesson', error.message)
}

/** Move a lesson to a module and persist that module's new lesson order. */
export async function reorderLessons(client: Client, moduleId: string, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id, index) => {
      const { error } = await client
        .from('university_lessons')
        .update({ module_id: moduleId, sort_order: index })
        .eq('id', id)
      if (error) fail('reorder lessons', error.message)
    })
  )
}
