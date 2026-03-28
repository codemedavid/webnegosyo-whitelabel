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

  it('creates Image elements for the first N urls', () => {
    const urls = [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
      'https://example.com/d.jpg',
    ]
    renderHook(() => useImagePreload(urls, 2))

    const imgCalls = createElementSpy.mock.results
      .filter((r: { type: string; value: HTMLElement }) => r.type === 'return' && r.value?.tagName === 'IMG')

    expect(imgCalls.length).toBe(2)
  })

  it('does nothing with empty urls', () => {
    renderHook(() => useImagePreload([], 6))

    const imgCalls = createElementSpy.mock.results
      .filter((r: { type: string; value: HTMLElement }) => r.type === 'return' && r.value?.tagName === 'IMG')

    expect(imgCalls.length).toBe(0)
  })

  it('defaults to 6 images when count not specified', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}.jpg`)
    renderHook(() => useImagePreload(urls))

    const imgCalls = createElementSpy.mock.results
      .filter((r: { type: string; value: HTMLElement }) => r.type === 'return' && r.value?.tagName === 'IMG')

    expect(imgCalls.length).toBe(6)
  })
})
