/**
 * The phone's lesson controls. A learner on a phone used to reach the next
 * lesson only by scrolling past the whole lesson body — the sidebar stacked
 * underneath everything — so these are the guarantees the bar has to keep:
 *
 *  1. Previous and next point at the neighbouring lessons of the course.
 *  2. The whole outline is one tap away, and tapping a lesson closes the sheet.
 *  3. Marking the lesson done from the bar is remembered per browser.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LessonNavBar } from '@/components/university/lesson-nav-bar'
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
    durationMinutes: 5,
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
      lessons: [lesson('one', 'First lesson', 0), lesson('two', 'Second lesson', 1), lesson('three', 'Third lesson', 2)],
    },
  ],
}

describe('LessonNavBar', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test('links to the lesson on either side of the current one', () => {
    render(<LessonNavBar course={course} currentLessonSlug="two" />)

    expect(screen.getByLabelText('Previous lesson')).toHaveAttribute('href', '/university/getting-started/one')
    expect(screen.getByLabelText('Next lesson')).toHaveAttribute('href', '/university/getting-started/three')
  })

  test('says where in the course the learner is', () => {
    render(<LessonNavBar course={course} currentLessonSlug="two" />)

    expect(screen.getByRole('button', { name: /Lesson 2 of 3/ })).toBeInTheDocument()
  })

  test('sends the last lesson back to the course instead of nowhere', () => {
    render(<LessonNavBar course={course} currentLessonSlug="three" />)

    expect(screen.queryByLabelText('Next lesson')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Back to the course')).toHaveAttribute('href', '/university/getting-started')
  })

  test('opens the whole outline in a sheet and closes it once a lesson is picked', async () => {
    const user = userEvent.setup()
    render(<LessonNavBar course={course} currentLessonSlug="two" />)

    await user.click(screen.getByRole('button', { name: /Lesson 2 of 3/ }))

    const sheet = screen.getByRole('dialog', { name: 'Course contents' })
    expect(within(sheet).getByRole('link', { name: /First lesson/ })).toHaveAttribute('href', '/university/getting-started/one')

    await user.click(within(sheet).getByRole('link', { name: /Third lesson/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('remembers a lesson marked complete from the bar', async () => {
    const user = userEvent.setup()
    render(<LessonNavBar course={course} currentLessonSlug="two" />)

    await user.click(screen.getByRole('button', { name: 'Mark lesson as complete' }))

    expect(window.localStorage.getItem('smartmenu-university:getting-started')).toBe('["two"]')
    expect(screen.getByRole('button', { name: 'Mark lesson as not done' })).toHaveAttribute('aria-pressed', 'true')
  })
})
