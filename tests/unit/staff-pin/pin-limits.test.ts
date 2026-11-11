/**
 * One set of manager-PIN limits for every PIN route: the remittance
 * "PIN here now" route must never be looser than Senior/PWD approval, and a
 * manager's PIN gets one budget whichever route the guesses come through.
 */
export {}

const mockRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))

async function load() {
  return import('@/lib/staff-pin/pin-limits')
}

beforeEach(() => {
  mockRateLimit.mockReset()
  mockRateLimit.mockResolvedValue({ allowed: true })
})

describe('PIN try limits', () => {
  it('keep the Senior/PWD numbers and fall back per instance (never open) when Redis fails', async () => {
    const { PIN_TRIES_PER_APPROVER, PIN_TRIES_PER_CALLER } = await load()

    expect(PIN_TRIES_PER_CALLER).toEqual({ limit: 20, windowSec: 60, onRedisFailure: 'instance' })
    expect(PIN_TRIES_PER_APPROVER).toEqual({ limit: 10, windowSec: 900, onRedisFailure: 'instance' })
  })

  it('checks the route’s own caller bucket and the approver’s shared bucket', async () => {
    const { checkPinTryLimits, PIN_TRIES_PER_APPROVER, PIN_TRIES_PER_CALLER } = await load()

    await checkPinTryLimits('cash-remit-pin:caller:t1:u1', 't1', 'boss')

    expect(mockRateLimit).toHaveBeenCalledWith('cash-remit-pin:caller:t1:u1', PIN_TRIES_PER_CALLER)
    expect(mockRateLimit).toHaveBeenCalledWith('gov-approve:approver:t1:boss', PIN_TRIES_PER_APPROVER)
  })

  it('refuses when either bucket is spent', async () => {
    const { checkPinTryLimits } = await load()
    mockRateLimit.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false })

    expect(await checkPinTryLimits('k', 't1', 'boss')).toBe(false)
  })
})
