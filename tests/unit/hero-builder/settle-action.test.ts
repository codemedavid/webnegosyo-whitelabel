import { ACTION_UNREACHABLE, settleAction } from '@/lib/hero-builder/settle-action'

describe('settleAction', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('hands back what the action answered, refusals included', async () => {
    await expect(settleAction(async () => ({ success: true }), 'x')).resolves.toEqual({ success: true })
    await expect(settleAction(async () => ({ success: false, error: 'No access' }), 'x')).resolves.toEqual({ success: false, error: 'No access' })
  })

  it('turns a request that never answered into a failure instead of throwing', async () => {
    const result = await settleAction(async () => {
      throw new TypeError('Failed to fetch')
    }, 'publish')
    expect(result).toEqual({ success: false, error: ACTION_UNREACHABLE })
    expect(console.error).toHaveBeenCalledWith('[publish] Request failed:', expect.any(TypeError))
  })
})
