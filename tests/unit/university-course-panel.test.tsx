/**
 * The course page's single call to action. The sidebar used to repeat the whole
 * curriculum that was already on the page, which on a phone meant scrolling the
 * same list twice; this card replaced it, so what it has to get right is which
 * lesson it opens.
 */

import { render, screen } from '@testing-library/react'
import { CoursePanel } from '@/components/university/course-panel'
import type { CourseWithCurriculum, LessonListItem } from '@/lib/university/service'

function lesson(slug: string, title: string, sortOrder: number): LessonListItem {
  return {
    id: slug,
    courseId: 'course-1',
    moduleId: 'module-1',
    slug,
    title,
    summary: null,
    videoUrl: null,
    durationMinutes: 4,
    status: 'published',
    sortOrder,
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

const course: CourseWithCurriculum = {
  id: 'course-1',
  slug: 'getting-started',
  title: 'Getting Started',
  description: null,
  coverImageUrl: null,
  category: null,
  level: 'beginner',
  status: 'published',
  sortOrder: 0,
  publishedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  modules: [
    {
      id: 'module-1',
      courseId: 'course-1',
      title: 'Welcome',
      description: null,
      sortOrder: 0,
      lessons: [lesson('one', 'First lesson', 0), lesson('two', 'Second lesson', 1)],
    },
  ],
}

describe('CoursePanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test('starts a fresh visitor on the first lesson', () => {
    render(<CoursePanel course={course} />)

    const cta = screen.getByRole('link', { name: /Start the course/ })
    expect(cta).toHaveAttribute('href', '/university/getting-started/one')
    expect(cta).toHaveTextContent('First lesson')
  })

  test('picks up at the first unfinished lesson and shows how far along it is', async () => {
    window.localStorage.setItem('smartmenu-university:getting-started', '["one"]')

    render(<CoursePanel course={course} />)

    const cta = await screen.findByRole('link', { name: /Continue where you left off/ })
    expect(cta).toHaveAttribute('href', '/university/getting-started/two')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText(/Lesson 2 of 2/)).toBeInTheDocument()
  })

  test('offers a rewatch once every lesson is done', async () => {
    window.localStorage.setItem('smartmenu-university:getting-started', '["one","two"]')

    render(<CoursePanel course={course} />)

    expect(await screen.findByRole('link', { name: /Review the course/ })).toHaveAttribute('href', '/university/getting-started/one')
  })

  test('renders nothing for a course with no published lessons', () => {
    const { container } = render(<CoursePanel course={{ ...course, modules: [] }} />)

    expect(container).toBeEmptyDOMElement()
  })
})
