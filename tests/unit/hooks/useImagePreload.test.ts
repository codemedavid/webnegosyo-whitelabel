import { renderHook } from '@testing-library/react'
import { useImagePreload } from '@/hooks/useImagePreload'

describe('useImagePreload', () => {
  let createElementSpy: jest.SpyInstance

  beforeEach(() => {
    createElementSpy = jest.spyOn(document, 'createElement')
  })

  afterEach(() => {
    createElementSpy.mockRestore()
  })

  const preloadLinks = (spy: jest.SpyInstance) =>
    spy.mock.results.filter((r) => {
      if (r.type !== 'return') return false
      const el = r.value as HTMLElement | undefined
      return el?.tagName === 'LINK' && (el as HTMLLinkElement).rel === 'preload'
    })

  it('creates preload links for the first N urls', () => {
    const urls = [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
      'https://example.com/d.jpg',
    ]
    renderHook(() => useImagePreload(urls, 2))

    expect(preloadLinks(createElementSpy).length).toBe(2)
  })

  it('does nothing with empty urls', () => {
    renderHook(() => useImagePreload([], 6))

    expect(preloadLinks(createElementSpy).length).toBe(0)
  })

  it('defaults to 6 preload links when count not specified', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}.jpg`)
    renderHook(() => useImagePreload(urls))

    expect(preloadLinks(createElementSpy).length).toBe(6)
  })
})
