import { assistantOwlState } from '@/components/admin/assistant/owl-mood'

describe('assistantOwlState', () => {
  it('is idle when nothing is happening', () => {
    expect(assistantOwlState({ hasError: false, isBusy: false, isCheering: false })).toBe('idle')
  })

  it('thinks while a reply is on its way', () => {
    expect(assistantOwlState({ hasError: false, isBusy: true, isCheering: false })).toBe('thinking')
  })

  it('is happy right after the owner confirms a change', () => {
    expect(assistantOwlState({ hasError: false, isBusy: false, isCheering: true })).toBe('happy')
  })

  it('owns an error over everything else', () => {
    expect(assistantOwlState({ hasError: true, isBusy: true, isCheering: true })).toBe('sorry')
  })

  it('keeps thinking over cheering while a new reply streams', () => {
    expect(assistantOwlState({ hasError: false, isBusy: true, isCheering: true })).toBe('thinking')
  })
})
