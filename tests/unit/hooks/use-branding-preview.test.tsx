/**
 * Branding Studio preview bridge — the storefront side of the editor's
 * iframe postMessage channel. When the page runs with ?brandingPreview=1,
 * draft messages from the same origin merge into the tenant object so the
 * real storefront renders unsaved branding in real time.
 */
import { renderHook, act } from '@testing-library/react'
import {
  useBrandingPreviewDraft,
  useBrandingPreviewTenant,
  BRANDING_DRAFT_MESSAGE,
  BRANDING_PREVIEW_PARAM,
  stripPreviewMeta,
} from '@/hooks/use-branding-preview'

function setSearch(search: string) {
  window.history.replaceState({}, '', `/demo/menu${search}`)
}

function postDraft(draft: Record<string, unknown>, origin = window.location.origin) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: BRANDING_DRAFT_MESSAGE, draft },
        origin,
      })
    )
  })
}

describe('useBrandingPreviewDraft', () => {
  it('stays null when the preview query param is absent', () => {
    setSearch('')
    const { result } = renderHook(() => useBrandingPreviewDraft())
    postDraft({ primary_color: '#ff0000' })
    expect(result.current).toBeNull()
  })

  it('captures same-origin draft messages when preview mode is on', () => {
    setSearch(`?${BRANDING_PREVIEW_PARAM}=1`)
    const { result } = renderHook(() => useBrandingPreviewDraft())
    postDraft({ primary_color: '#ff0000' })
    expect(result.current).toEqual({ primary_color: '#ff0000' })
  })

  it('ignores messages from a different origin', () => {
    setSearch(`?${BRANDING_PREVIEW_PARAM}=1`)
    const { result } = renderHook(() => useBrandingPreviewDraft())
    postDraft({ primary_color: '#ff0000' }, 'https://evil.example.com')
    expect(result.current).toBeNull()
  })

  it('ignores malformed messages', () => {
    setSearch(`?${BRANDING_PREVIEW_PARAM}=1`)
    const { result } = renderHook(() => useBrandingPreviewDraft())
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: 'junk', origin: window.location.origin })
      )
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: BRANDING_DRAFT_MESSAGE, draft: 'not-an-object' },
          origin: window.location.origin,
        })
      )
    })
    expect(result.current).toBeNull()
  })
})

describe('useBrandingPreviewTenant', () => {
  it('returns the tenant untouched outside preview mode', () => {
    setSearch('')
    const tenant = { id: 't1', primary_color: '#111111' }
    const { result } = renderHook(() => useBrandingPreviewTenant(tenant))
    expect(result.current).toBe(tenant)
  })

  it('merges the live draft over tenant columns, dropping meta keys', () => {
    setSearch(`?${BRANDING_PREVIEW_PARAM}=1`)
    const tenant = { id: 't1', primary_color: '#111111', cards_color: '#ffffff' }
    const { result } = renderHook(() => useBrandingPreviewTenant(tenant))

    postDraft({ primary_color: '#00ff00', __previewSurface: 'storefront' })

    expect(result.current).toEqual({
      id: 't1',
      primary_color: '#00ff00',
      cards_color: '#ffffff',
    })
  })

  it('passes null tenants through', () => {
    setSearch(`?${BRANDING_PREVIEW_PARAM}=1`)
    const { result } = renderHook(() => useBrandingPreviewTenant(null))
    expect(result.current).toBeNull()
  })
})

describe('stripPreviewMeta', () => {
  it('removes double-underscore meta keys only', () => {
    expect(stripPreviewMeta({ a: 1, __previewSurface: 'flash' })).toEqual({ a: 1 })
  })
})
