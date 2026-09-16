import React, { StrictMode } from 'react'
import { act, render } from '@testing-library/react'
import { LandingViewContent } from '@/components/tracking/landing-view-content'
import { MetaPixelBootstrap } from '@/components/tracking/meta-pixel-bootstrap'
import { META_PIXEL_READY_EVENT } from '@/lib/meta-pixel'

jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ id, dangerouslySetInnerHTML }: { id?: string; dangerouslySetInnerHTML?: { __html: string } }) =>
    <script id={id} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />,
}))
beforeEach(() => { delete window.fbq; delete window._fbq })
afterEach(() => { delete window.fbq; delete window._fbq })

it('queues one landing event after the deferred bootstrap, without another init or PageView', () => {
  render(<StrictMode><MetaPixelBootstrap pixelId="123456" /><LandingViewContent /></StrictMode>)
  expect(window.fbq).toBeUndefined()
  const script = document.getElementById('meta-pixel-bootstrap')!
  act(() => { window.eval(script.textContent!) })
  expect(window.fbq?.queue?.map(args => Array.from(args))).toEqual([
    ['init', '123456'],
    ['track', 'PageView'],
    ['track', 'ViewContent', { content_name: 'SmartMenu by WebNegosyo', content_category: 'Marketing Landing Page' }],
  ])
  act(() => { window.dispatchEvent(new Event(META_PIXEL_READY_EVENT)) })
  expect(window.fbq?.queue).toHaveLength(3)
})

it('tracks once when bootstrap was ready before hydration', () => {
  const track = jest.fn()
  window.fbq = track
  const view = render(<StrictMode><LandingViewContent /></StrictMode>)
  view.rerender(<StrictMode><LandingViewContent /></StrictMode>)
  expect(track).toHaveBeenCalledTimes(1)
  expect(track).toHaveBeenCalledWith('track', 'ViewContent', expect.objectContaining({ content_name: 'SmartMenu by WebNegosyo' }))
})

it('does not emit a landing event after leaving before bootstrap readiness', () => {
  const view = render(<LandingViewContent />)
  view.unmount()
  window.fbq = jest.fn()
  act(() => { window.dispatchEvent(new Event(META_PIXEL_READY_EVENT)) })
  expect(window.fbq).not.toHaveBeenCalled()
})
