import { renderHook } from '@testing-library/react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

describe('useBodyScrollLock', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  it('sets body overflow to hidden when active', () => {
    renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('does not set overflow when inactive', () => {
    renderHook(() => useBodyScrollLock(false))
    expect(document.body.style.overflow).toBe('')
  })

  it('restores original overflow on unmount', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('restores overflow when active changes to false', () => {
    const { rerender } = renderHook(
      ({ active }) => useBodyScrollLock(active),
      { initialProps: { active: true } }
    )
    expect(document.body.style.overflow).toBe('hidden')
    rerender({ active: false })
    expect(document.body.style.overflow).toBe('')
  })
})
