import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import type { SlideshowContent } from '@/lib/hero-builder/types'

/**
 * The promo slideshow advances on its own until the visitor takes over, and
 * never moves for someone who asked their device for less motion.
 */

const content: SlideshowContent = {
  kind: 'slideshow',
  autoplay: true,
  interval: 2,
  showDots: true,
  slides: [
    { id: 's1', src: 'https://example.com/1.jpg', alt: 'One', title: 'One' },
    { id: 's2', src: 'https://example.com/2.jpg', alt: 'Two', title: 'Two' },
    { id: 's3', src: 'https://example.com/3.jpg', alt: 'Three', title: 'Three' },
  ],
}

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() }),
  })
}

async function renderSlideshow() {
  const { SlideshowBlock } = await import('@/components/hero-builder/renderer/welcome-blocks')
  render(<SlideshowBlock content={content} isEditor={false} />)
}

const currentSlide = () => screen.getAllByRole('button').findIndex((dot) => dot.getAttribute('aria-current') === 'true')

beforeEach(() => {
  jest.useFakeTimers()
  mockReducedMotion(false)
})

afterEach(() => {
  jest.useRealTimers()
})

it('advances to the next slide every interval', async () => {
  await renderSlideshow()
  expect(currentSlide()).toBe(0)
  act(() => jest.advanceTimersByTime(2000))
  expect(currentSlide()).toBe(1)
})

it('never autoplays when the visitor prefers reduced motion', async () => {
  mockReducedMotion(true)
  await renderSlideshow()
  act(() => jest.advanceTimersByTime(6000))
  expect(currentSlide()).toBe(0)
})

it('stops for good after a sideways trackpad swipe', async () => {
  await renderSlideshow()
  const track = document.querySelector('.hb-slides-track') as HTMLElement
  fireEvent.wheel(track, { deltaX: 40, deltaY: 2 })
  act(() => jest.advanceTimersByTime(6000))
  expect(currentSlide()).toBe(0)
})

it('keeps playing when the page is only scrolled vertically over it', async () => {
  await renderSlideshow()
  const track = document.querySelector('.hb-slides-track') as HTMLElement
  fireEvent.wheel(track, { deltaX: 0, deltaY: 60 })
  act(() => jest.advanceTimersByTime(2000))
  expect(currentSlide()).toBe(1)
})
