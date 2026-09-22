/**
 * A course cover is requested at the size it is drawn at.
 *
 * The portal rendered the stored original — a 2000px upload behind a 380px
 * card — on both the catalog and the course hero, which was most of what
 * those pages weighed. A cover hosted somewhere the CDN cannot resize must
 * still render, untouched, rather than disappear.
 */
import { render } from '@testing-library/react'
import { CourseCover } from '@/components/university/course-cover'

const IMAGEKIT_URL = 'https://ik.imagekit.io/hau6qlmlz/courses/cover.jpg'
const CARD_SIZES = '(min-width: 1024px) 360px, 100vw'

function coverOf(container: HTMLElement): HTMLImageElement {
  const image = container.querySelector('img')
  if (!image) throw new Error('no cover rendered')
  return image
}

describe('course cover', () => {
  it('asks the CDN for a resized variant and offers a srcSet', () => {
    const { container } = render(<CourseCover url={IMAGEKIT_URL} sizes={CARD_SIZES} />)
    const image = coverOf(container)

    expect(image.getAttribute('src')).toContain('tr=')
    expect(image.getAttribute('srcset')).toContain('320w')
    expect(image.getAttribute('srcset')).toContain('1920w')
    expect(image.getAttribute('sizes')).toBe(CARD_SIZES)
  })

  it('lazy-loads a cover below the fold and eagerly loads one above it', () => {
    const { container: lazy } = render(<CourseCover url={IMAGEKIT_URL} sizes={CARD_SIZES} />)
    expect(coverOf(lazy).getAttribute('loading')).toBe('lazy')

    const { container: eager } = render(<CourseCover url={IMAGEKIT_URL} sizes="100vw" priority />)
    expect(coverOf(eager).getAttribute('loading')).toBe('eager')
  })

  it('renders a cover the CDN cannot resize as-is, with no srcSet to mislead the browser', () => {
    const elsewhere = 'https://example.com/cover.png'
    const { container } = render(<CourseCover url={elsewhere} sizes={CARD_SIZES} />)
    const image = coverOf(container)

    expect(image.getAttribute('src')).toBe(elsewhere)
    expect(image.getAttribute('srcset')).toBeNull()
    expect(image.getAttribute('sizes')).toBeNull()
  })
})
