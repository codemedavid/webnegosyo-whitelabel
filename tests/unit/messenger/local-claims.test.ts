import { createLocalClaims } from '@/lib/messenger/local-claims'

describe('instance claims under the Redis claim', () => {
  it('grants a tap once until it expires or is given back', () => {
    const claims = createLocalClaims(1000)
    expect(claims.claim('s1:tap', 0)).toBe(true)
    expect(claims.claim('s1:tap', 500)).toBe(false)
    expect(claims.claim('s1:other', 500)).toBe(true)
    expect(claims.claim('s1:tap', 1000)).toBe(true)
    claims.release('s1:tap')
    expect(claims.claim('s1:tap', 1001)).toBe(true)
  })

  it('stays bounded: expired keys go first, then the oldest', () => {
    const claims = createLocalClaims(1000, 2)
    claims.claim('a', 0)
    claims.claim('b', 0)
    expect(claims.claim('c', 10)).toBe(true) // 'a' forgotten to make room
    expect(claims.claim('b', 10)).toBe(false)
    expect(claims.claim('a', 10)).toBe(true)
  })
})
