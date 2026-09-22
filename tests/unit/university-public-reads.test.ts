/**
 * University portal reads degrade rather than crash.
 *
 * A failed read must reach the page as an empty catalog (so the portal still
 * renders), must not be stored in the data cache (so one blip does not pin an
 * empty portal for the whole revalidation window), and must name its cause in
 * the log. Before this, the cause was swallowed and the only visible symptom
 * was `UncachedResultSignal` — the cache boundary's own control-flow marker,
 * which says nothing about what broke.
 *
 * `jest.mock` is not hoisted above the static imports under next/jest's SWC
 * transform, so the module under test is imported lazily inside each test.
 */

const listCourses = jest.fn()
const getCourseBySlug = jest.fn()
const getLessonBySlug = jest.fn()

jest.mock('@/lib/university/service', () => ({
  listCourses: (...args: unknown[]) => listCourses(...args),
  getCourseBySlug: (...args: unknown[]) => getCourseBySlug(...args),
  getLessonBySlug: (...args: unknown[]) => getLessonBySlug(...args),
}))

jest.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({}),
  describePublicQueryError: (message: string) => message,
}))

// Run the wrapped loader straight through: this test is about the loader's
// failure handling, not about Next's cache storage.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

async function loadModule() {
  return import('@/lib/university/public-reads')
}

describe('university portal reads', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('degrades a failed catalog read to an empty list and logs the cause', async () => {
    listCourses.mockRejectedValue(new Error('Failed to load courses: schema cache miss'))
    const { getPublishedCourses } = await loadModule()

    await expect(getPublishedCourses()).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('schema cache miss'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[university]'))
  })

  it('degrades a failed course read to null and names the course', async () => {
    getCourseBySlug.mockRejectedValue(new Error('boom'))
    const { getPublishedCourse } = await loadModule()

    await expect(getPublishedCourse('menu-engineering')).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('menu-engineering'))
  })

  it('degrades a failed lesson read to null and names the lesson', async () => {
    getCourseBySlug.mockRejectedValue(new Error('boom'))
    const { getPublishedLesson } = await loadModule()

    await expect(getPublishedLesson('course-a', 'lesson-b')).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('course-a/lesson-b'))
  })

  it('lists only courses that have a published lesson', async () => {
    listCourses.mockResolvedValue([
      { id: '1', title: 'Ready', publishedLessonCount: 2 },
      { id: '2', title: 'Nothing live yet', publishedLessonCount: 0 },
    ])
    const { getPublishedCourses } = await loadModule()

    const courses = await getPublishedCourses()
    expect(courses.map((course) => course.title)).toEqual(['Ready'])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('hides a draft lesson from a published course', async () => {
    getCourseBySlug.mockResolvedValue({
      id: 'c1',
      slug: 'course-a',
      modules: [
        {
          id: 'm1',
          lessons: [
            { id: 'l1', slug: 'live', status: 'published' },
            { id: 'l2', slug: 'draft', status: 'draft' },
          ],
        },
        { id: 'm2', lessons: [{ id: 'l3', slug: 'hidden', status: 'draft' }] },
      ],
    })
    const { getPublishedCourse } = await loadModule()

    const course = await getPublishedCourse('course-a')
    // The all-draft module disappears entirely rather than rendering empty.
    expect(course?.modules).toHaveLength(1)
    expect(course?.modules[0].lessons.map((lesson) => lesson.slug)).toEqual(['live'])
  })

  it('lists one prerender param per published course', async () => {
    listCourses.mockResolvedValue([
      { id: '1', slug: 'menu-engineering', publishedLessonCount: 2 },
      { id: '2', slug: 'not-live-yet', publishedLessonCount: 0 },
    ])
    const { listPublishedCourseParams } = await loadModule()

    await expect(listPublishedCourseParams()).resolves.toEqual([{ course: 'menu-engineering' }])
  })

  it('lists one prerender param per published lesson, in reading order', async () => {
    listCourses.mockResolvedValue([{ id: 'c1', slug: 'course-a', publishedLessonCount: 2 }])
    getCourseBySlug.mockResolvedValue({
      id: 'c1',
      slug: 'course-a',
      modules: [
        {
          id: 'm1',
          lessons: [
            { id: 'l1', slug: 'one', status: 'published' },
            { id: 'l2', slug: 'still-writing', status: 'draft' },
          ],
        },
        { id: 'm2', lessons: [{ id: 'l3', slug: 'two', status: 'published' }] },
      ],
    })
    const { listPublishedLessonParams } = await loadModule()

    await expect(listPublishedLessonParams()).resolves.toEqual([
      { course: 'course-a', lesson: 'one' },
      { course: 'course-a', lesson: 'two' },
    ])
  })

  // A build must never fail because the database was briefly unwell: the
  // degraded read yields no params, and the pages fall back to rendering on
  // demand.
  it('yields no prerender params when the catalog read fails', async () => {
    listCourses.mockRejectedValue(new Error('statement timeout'))
    const { listPublishedCourseParams, listPublishedLessonParams } = await loadModule()

    await expect(listPublishedCourseParams()).resolves.toEqual([])
    await expect(listPublishedLessonParams()).resolves.toEqual([])
  })
})
