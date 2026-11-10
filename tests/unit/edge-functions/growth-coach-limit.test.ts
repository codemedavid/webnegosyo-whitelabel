import { describe, expect, it, jest } from '@jest/globals'
import { createInstanceCounter, checkCoachLimit, isMerchantRole } from '../../../supabase/functions/growth-coach/limit'

describe('isMerchantRole', () => {
  it('admits store staff and platform accounts only', () => {
    expect(isMerchantRole('admin')).toBe(true)
    expect(isMerchantRole('superadmin')).toBe(true)
    expect(isMerchantRole('platform_staff')).toBe(true)
    expect(isMerchantRole('customer')).toBe(false)
    expect(isMerchantRole(null)).toBe(false)
    expect(isMerchantRole(undefined)).toBe(false)
  })
})

describe('createInstanceCounter', () => {
  it('counts per key inside a window and starts over after it', () => {
    let now = 1_000
    const count = createInstanceCounter(() => now)
    expect(count('u1', 60)).toBe(1)
    expect(count('u1', 60)).toBe(2)
    expect(count('u2', 60)).toBe(1)
    now += 60_001
    expect(count('u1', 60)).toBe(1)
  })
})

describe('checkCoachLimit', () => {
  const options = { limit: 2, windowSec: 3600 }
  const reply = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response

  it('counts in the instance when Redis is not configured', async () => {
    const counter = createInstanceCounter(() => 0)
    const check = () => checkCoachLimit('u1', options, { counter })
    await expect(check()).resolves.toBe(true)
    await expect(check()).resolves.toBe(true)
    await expect(check()).resolves.toBe(false)
  })

  it('counts in Redis when configured, so every instance shares it', async () => {
    const fetchImpl = jest.fn(async () => reply([{ result: 3 }, { result: 1 }]))
    const allowed = await checkCoachLimit('u1', options, {
      counter: createInstanceCounter(() => 0),
      redis: { url: 'https://redis.example', token: 'tok' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 7_200_000,
    })
    expect(allowed).toBe(false)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://redis.example/pipeline')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)[0]).toEqual(['INCR', 'rl:growth-coach:u1:2'])
  })

  it('falls back to the instance when Redis fails: an outage never leaves the paid call unmetered', async () => {
    const counter = createInstanceCounter(() => 0)
    const deps = {
      counter,
      redis: { url: 'https://redis.example', token: 'tok' },
      fetchImpl: (async () => { throw new Error('down') }) as unknown as typeof fetch,
    }
    await expect(checkCoachLimit('u1', options, deps)).resolves.toBe(true)
    await expect(checkCoachLimit('u1', options, deps)).resolves.toBe(true)
    await expect(checkCoachLimit('u1', options, deps)).resolves.toBe(false)
  })
})
