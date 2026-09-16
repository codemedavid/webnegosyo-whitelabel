import { render, screen, act, fireEvent } from '@testing-library/react'
import { PreviewFrame, PREVIEW_READY_TIMEOUT_MS } from '@/components/admin/branding-studio/preview-frame'
import { BRANDING_READY_MESSAGE } from '@/hooks/use-branding-preview'

/**
 * A preview that never paints used to be a silent white pane. QA reported the
 * SeaCook studio exactly so — controls on the left, nothing on the right —
 * with no way to tell a slow storefront from a broken one. The frame now
 * announces itself when the storefront has not said "ready" in time, and
 * hands the merchant the framed URL so they can look at it directly.
 */

function renderFrame() {
  return render(
    <PreviewFrame tenantSlug="seacook" surfaceId="storefront" draft={{}} device="desktop" />
  )
}

function announceReady() {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: BRANDING_READY_MESSAGE },
        origin: window.location.origin,
      })
    )
  })
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('PreviewFrame ready fallback', () => {
  it('shows nothing but the iframe while the storefront is still loading', () => {
    renderFrame()
    expect(screen.queryByText(/preview did not load/i)).not.toBeInTheDocument()
  })

  it('names the problem and links the framed page when no ready signal arrives in time', () => {
    renderFrame()
    act(() => {
      jest.advanceTimersByTime(PREVIEW_READY_TIMEOUT_MS + 1)
    })

    expect(screen.getByText(/preview did not load/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /open the storefront in a new tab/i })
    expect(link).toHaveAttribute('href', '/seacook/menu?brandingPreview=1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('stays quiet once the storefront announces it is ready', () => {
    renderFrame()
    announceReady()
    act(() => {
      jest.advanceTimersByTime(PREVIEW_READY_TIMEOUT_MS + 1)
    })

    expect(screen.queryByText(/preview did not load/i)).not.toBeInTheDocument()
  })

  it('clears the notice and reloads the frame on retry', () => {
    const { container } = renderFrame()
    act(() => {
      jest.advanceTimersByTime(PREVIEW_READY_TIMEOUT_MS + 1)
    })
    const before = container.querySelector('iframe')

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.queryByText(/preview did not load/i)).not.toBeInTheDocument()
    expect(container.querySelector('iframe')).not.toBe(before)
  })
})
