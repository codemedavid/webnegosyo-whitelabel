import { resumePoint } from '@/lib/university/resume'
import type { LessonListItem } from '@/lib/university/service'

function lesson(slug: string): LessonListItem {
  return {
    id: slug,
    courseId: 'course',
    moduleId: 'module',
    slug,
    title: slug,
    summary: null,
    videoUrl: null,
    durationMinutes: null,
    status: 'published',
    sortOrder: 0,
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('resumePoint', () => {
  test('returns null when the course has no lessons', () => {
    expect(resumePoint([], [])).toBeNull()
  })

  test('starts at the first lesson when nothing is completed', () => {
    const lessons = [lesson('a'), lesson('b')]

    const point = resumePoint(lessons, [])

    expect(point).toEqual({ lesson: lessons[0], index: 0, state: 'start' })
  })

  test('continues at the first lesson that is not completed', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c')]

    const point = resumePoint(lessons, ['a'])

    expect(point).toEqual({ lesson: lessons[1], index: 1, state: 'continue' })
  })

  test('skips completed lessons that are out of order', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c')]

    const point = resumePoint(lessons, ['b', 'a'])

    expect(point?.lesson.slug).toBe('c')
  })

  test('offers the first lesson for review once every lesson is done', () => {
    const lessons = [lesson('a'), lesson('b')]

    const point = resumePoint(lessons, ['a', 'b'])

    expect(point).toEqual({ lesson: lessons[0], index: 0, state: 'review' })
  })

  test('ignores completion entries for lessons the course no longer has', () => {
    const lessons = [lesson('a')]

    const point = resumePoint(lessons, ['removed'])

    expect(point?.state).toBe('start')
  })
})
