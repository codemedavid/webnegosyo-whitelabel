import { act, renderHook } from '@testing-library/react'
import { useBrandingPreviewDraft, useIsMobileViewport, BRANDING_DRAFT_MESSAGE } from '@/hooks/use-branding-preview'

beforeEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/?brandingPreview=1')
})
afterEach(() => jest.restoreAllMocks())

it('shares one message listener and broadcasts one draft snapshot to all consumers', () => {
  const add = jest.spyOn(window, 'addEventListener')
  const remove = jest.spyOn(window, 'removeEventListener')
  const a = renderHook(() => useBrandingPreviewDraft())
  const b = renderHook(() => useBrandingPreviewDraft())
  expect(add.mock.calls.filter(([name]) => name === 'message')).toHaveLength(1)
  act(() => window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin, data: { type: BRANDING_DRAFT_MESSAGE, draft: { primary_color: '#abcdef' } },
  })))
  expect(a.result.current).toEqual({ primary_color: '#abcdef' })
  expect(b.result.current).toBe(a.result.current)
  a.unmount()
  expect(remove.mock.calls.filter(([name]) => name === 'message')).toHaveLength(0)
  b.unmount()
  expect(remove.mock.calls.filter(([name]) => name === 'message')).toHaveLength(1)
})

it('shares a viewport subscription and releases it when the final consumer leaves', () => {
  let matches = false
  let change: () => void = () => {}
  const add = jest.fn((_event: string, listener: () => void) => { change = listener })
  const remove = jest.fn()
  window.matchMedia = jest.fn().mockImplementation(() => ({ get matches() { return matches }, addEventListener: add, removeEventListener: remove }))
  const a = renderHook(() => useIsMobileViewport())
  const b = renderHook(() => useIsMobileViewport())
  expect(add).toHaveBeenCalledTimes(1)
  act(() => { matches = true; change() })
  expect(a.result.current).toBe(true)
  expect(b.result.current).toBe(true)
  a.unmount()
  expect(remove).not.toHaveBeenCalled()
  b.unmount()
  expect(remove).toHaveBeenCalledTimes(1)
})
