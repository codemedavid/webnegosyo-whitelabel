/**
 * The online rule for a sending phone, at the SERVER's clock. Thresholds are
 * at least 3x the worker's cadence (60s idle poll, 10 min in quiet hours,
 * 30 min waits at the daily limit), so one missed poll never flips a state.
 * The hero picks the best phone, says "sending" only when a run is open and
 * that phone is ready, and never says ready when the read failed.
 */

import {
  INACTIVE_AFTER_SEC,
  MIN_SENDER_APP_VERSION,
  heroStateFor,
  isAppOld,
  phoneDisplayName,
  phoneHealth,
  pickPrimaryPhone,
} from '@/lib/texts/phone-health'
import type { SendingPhone } from '@/lib/texts/types'

const NOW = new Date('2026-10-14T06:00:00Z')
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()
const base = { now: NOW, isQuietNow: false, isLimitReached: false }

describe('phoneHealth', () => {
  it.each([
    [0, 'ready'],
    [180, 'ready'],
    [181, 'late'],
    [1800, 'late'],
    [1801, 'offline'],
  ])('outside quiet hours, %is since check-in is %s', (seconds, state) => {
    expect(phoneHealth({ ...base, lastSeenAt: ago(seconds) }).state).toBe(state)
  })

  it('is never when the phone has not checked in at all', () => {
    expect(phoneHealth({ ...base, lastSeenAt: null })).toEqual({ state: 'never', ageSeconds: null, isInactive: false })
  })

  it.each([
    [60, 'resting'],
    [900, 'resting'],
    [901, 'late'],
    [1801, 'offline'],
  ])('in quiet hours, %is since check-in is %s', (seconds, state) => {
    expect(phoneHealth({ ...base, isQuietNow: true, lastSeenAt: ago(seconds) }).state).toBe(state)
  })

  it.each([
    [2100, 'resting'],
    [2101, 'offline'],
  ])('at the daily limit, %is since check-in is %s', (seconds, state) => {
    expect(phoneHealth({ ...base, isLimitReached: true, lastSeenAt: ago(seconds) }).state).toBe(state)
  })

  it('reports the age in whole seconds and clamps a future check-in to 0', () => {
    expect(phoneHealth({ ...base, lastSeenAt: ago(42.7) }).ageSeconds).toBe(42)
    expect(phoneHealth({ ...base, lastSeenAt: ago(-30) })).toMatchObject({ state: 'ready', ageSeconds: 0 })
  })

  it('marks a phone quiet for over 48 hours as inactive', () => {
    expect(phoneHealth({ ...base, lastSeenAt: ago(INACTIVE_AFTER_SEC) }).isInactive).toBe(false)
    expect(phoneHealth({ ...base, lastSeenAt: ago(INACTIVE_AFTER_SEC + 1) }).isInactive).toBe(true)
  })

  it('treats an unreadable timestamp as never checked in', () => {
    expect(phoneHealth({ ...base, lastSeenAt: 'yesterday' }).state).toBe('never')
  })
})

function phone(overrides: Partial<SendingPhone>): SendingPhone {
  return {
    deviceId: 'd', name: 'Phone', hasCustomName: false, model: null, appVersion: null, isAppOld: false,
    state: 'ready', lastSeenAt: ago(10), ageSeconds: 10, isInactive: false, connectedAt: null, connectedBy: null,
    sentToday: 0, failedToday: 0, sendingNow: 0, smsPermission: null, isBatteryUnrestricted: null,
    ...overrides,
  }
}

describe('pickPrimaryPhone', () => {
  it('picks the best state, then the most recent check-in', () => {
    const offline = phone({ deviceId: 'a', state: 'offline', ageSeconds: 4000 })
    const lateOld = phone({ deviceId: 'b', state: 'late', ageSeconds: 1500 })
    const lateNew = phone({ deviceId: 'c', state: 'late', ageSeconds: 400 })
    expect(pickPrimaryPhone([offline, lateOld, lateNew])?.deviceId).toBe('c')
  })

  it('prefers a resting phone over a late one, and is null with no phones', () => {
    expect(pickPrimaryPhone([phone({ deviceId: 'l', state: 'late' }), phone({ deviceId: 'r', state: 'resting' })])?.deviceId).toBe('r')
    expect(pickPrimaryPhone([])).toBeNull()
  })
})

describe('heroStateFor', () => {
  it('is unknown on a read error, never ready', () => {
    expect(heroStateFor({ primary: phone({}), hasReadError: true, hasOpenRun: false })).toBe('unknown')
  })

  it('is none with no phone', () => {
    expect(heroStateFor({ primary: null, hasReadError: false, hasOpenRun: true })).toBe('none')
  })

  it('is sending only when a run is open and the best phone is ready', () => {
    expect(heroStateFor({ primary: phone({}), hasReadError: false, hasOpenRun: true })).toBe('sending')
    expect(heroStateFor({ primary: phone({ state: 'late' }), hasReadError: false, hasOpenRun: true })).toBe('late')
    expect(heroStateFor({ primary: phone({}), hasReadError: false, hasOpenRun: false })).toBe('ready')
  })

  it('maps resting, late and offline through, and a phone that never checked in to offline', () => {
    expect(heroStateFor({ primary: phone({ state: 'resting' }), hasReadError: false, hasOpenRun: false })).toBe('resting')
    expect(heroStateFor({ primary: phone({ state: 'offline' }), hasReadError: false, hasOpenRun: false })).toBe('offline')
    expect(heroStateFor({ primary: phone({ state: 'never' }), hasReadError: false, hasOpenRun: false })).toBe('offline')
  })
})

describe('isAppOld', () => {
  it('compares dotted versions numerically against the minimum', () => {
    expect(MIN_SENDER_APP_VERSION).toBe('1.0.13')
    expect(isAppOld('1.0.12')).toBe(true)
    expect(isAppOld('1.0.9')).toBe(true)
    expect(isAppOld('1.0.13')).toBe(false)
    expect(isAppOld('1.0.14-beta.1')).toBe(false)
    expect(isAppOld('1.1')).toBe(false)
    expect(isAppOld('2.0.0')).toBe(false)
  })

  it('does not call an unknown version old (an older app sends no report at all)', () => {
    expect(isAppOld(null)).toBe(false)
    expect(isAppOld('banana')).toBe(false)
  })
})

describe('phoneDisplayName', () => {
  it('prefers the owner label, then make and model, then a plain name', () => {
    expect(phoneDisplayName({ label: "Juan's phone", manufacturer: 'samsung', model: 'SM-A155F' })).toBe("Juan's phone")
    expect(phoneDisplayName({ label: null, manufacturer: 'samsung', model: 'SM-A155F' })).toBe('Samsung SM-A155F')
    expect(phoneDisplayName({ label: null, manufacturer: 'Google', model: 'Google Pixel 7' })).toBe('Google Pixel 7')
    expect(phoneDisplayName({ label: null, manufacturer: null, model: 'Pixel 7' })).toBe('Pixel 7')
    expect(phoneDisplayName({ label: null, manufacturer: 'Xiaomi', model: null })).toBe('Xiaomi phone')
    expect(phoneDisplayName({ label: '  ', manufacturer: null, model: null })).toBe('Android phone')
  })
})

describe('withDistinctNames', () => {
  it('numbers phones that would otherwise share a name, keeping owner labels', async () => {
    const { withDistinctNames } = await import('@/lib/texts/phone-health')
    const phones = [
      { name: 'Android phone', hasCustomName: false },
      { name: 'Counter', hasCustomName: true },
      { name: 'Android phone', hasCustomName: false },
      { name: 'Samsung SM-A155F', hasCustomName: false },
    ]
    expect(withDistinctNames(phones).map((p) => p.name))
      .toEqual(['Android phone 1', 'Counter', 'Android phone 2', 'Samsung SM-A155F'])
    expect(phones[0].name).toBe('Android phone') // not mutated
  })
})
