/**
 * The hero gallery is a swipeable carousel: every slide stays mounted (so a
 * switch never shows an empty frame while a photo downloads), thumbnails and
 * arrows scroll the track, and swiping the track moves the active thumbnail.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FunnelGallery } from '@/components/funnel/funnel-gallery'

const SLIDE_WIDTH = 400

function getTrack(): HTMLElement {
  return screen.getByTestId('funnel-gallery-track')
}

function stubTrackGeometry(track: HTMLElement) {
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: SLIDE_WIDTH })
  const scrollTo = jest.fn((options: ScrollToOptions) => {
    Object.defineProperty(track, 'scrollLeft', { configurable: true, value: options.left ?? 0 })
  })
  track.scrollTo = scrollTo as unknown as typeof track.scrollTo
  return scrollTo
}

function thumbnails(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /^photo \d/i })
}

describe('FunnelGallery', () => {
  beforeEach(() => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
  })

  it('keeps every slide mounted so switching never shows an empty frame', () => {
    render(<FunnelGallery />)
    const slides = getTrack().querySelectorAll('[data-slide]')
    expect(slides.length).toBe(thumbnails().length)
    expect(slides.length).toBeGreaterThan(1)
  })

  it('scrolls the track to the tapped thumbnail and marks it active', () => {
    render(<FunnelGallery />)
    const scrollTo = stubTrackGeometry(getTrack())

    fireEvent.click(thumbnails()[2])

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 2 * SLIDE_WIDTH }))
    expect(thumbnails()[2].getAttribute('aria-pressed')).toBe('true')
    expect(thumbnails()[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('moves the active thumbnail when the visitor swipes the track', () => {
    render(<FunnelGallery />)
    const track = getTrack()
    stubTrackGeometry(track)

    Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 3 * SLIDE_WIDTH })
    act(() => {
      fireEvent.scroll(track)
    })

    expect(thumbnails()[3].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(`4 / ${thumbnails().length}`)).toBeTruthy()
  })

  it('steps with the next and previous arrows and stops at the ends', () => {
    render(<FunnelGallery />)
    const scrollTo = stubTrackGeometry(getTrack())
    const previous = screen.getByRole('button', { name: /previous photo/i })
    const next = screen.getByRole('button', { name: /next photo/i })

    expect(previous.hasAttribute('disabled')).toBe(true)
    fireEvent.click(next)
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: SLIDE_WIDTH }))
    expect(previous.hasAttribute('disabled')).toBe(false)

    fireEvent.click(thumbnails()[thumbnails().length - 1])
    expect(next.hasAttribute('disabled')).toBe(true)
  })

  it('moves with the arrow keys when the carousel has focus', () => {
    render(<FunnelGallery />)
    const track = getTrack()
    const scrollTo = stubTrackGeometry(track)

    fireEvent.keyDown(track, { key: 'ArrowRight' })

    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: SLIDE_WIDTH }))
  })
})
