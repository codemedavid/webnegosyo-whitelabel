import type { SenderSummary, SendingPhone } from '@/lib/texts/types'
import { heroView } from '@/lib/texts/view/hero'

const NOW = Date.parse('2026-10-14T06:10:00Z') // 2:10 PM Manila

function phone(overrides: Partial<SendingPhone> = {}): SendingPhone {
  return {
    deviceId: 'd1', name: "Juan's Galaxy A15", hasCustomName: true, manufacturer: null, model: 'SM-A155F', appVersion: '1.0.14',
    isAppOld: false, state: 'ready', lastSeenAt: new Date(NOW - 60_000).toISOString(), ageSeconds: 60,
    isInactive: false, connectedAt: null, connectedBy: null, sentToday: 0, failedToday: 0, sendingNow: 0,
    smsPermission: null, isBatteryUnrestricted: null, ...overrides,
  }
}

function sender(overrides: Partial<SenderSummary> = {}): SenderSummary {
  const primary = phone()
  return {
    heroState: 'ready', primary, phones: [primary], maxPhones: 5, waiting: 0, sentToday: 37, dailyLimit: 100,
    isQuietNow: false, quietUntil: null, allOutBy: null, sending: null, now: new Date(NOW).toISOString(), ...overrides,
  }
}

describe('heroView', () => {
  test('ready, nothing waiting', () => {
    const view = heroView(sender(), false)
    expect(view.word).toBe('Ready')
    expect(view.sentence).toBe("Juan's Galaxy A15 checked in 1 min ago · Nothing waiting to send")
    expect(view.tone).toBe('emerald')
    expect(view.action).toEqual({ label: 'Phones', kind: 'phones' })
    expect(view.meter).toEqual({ sent: 37, limit: 100, text: 'Sent today 37 of 100' })
  })

  test('ready with a queue says when it is all out', () => {
    const view = heroView(sender({ waiting: 12, allOutBy: new Date(NOW + 90 * 60_000).toISOString() }), false)
    expect(view.sentence).toBe("Juan's Galaxy A15 checked in 1 min ago · 12 waiting · all out by 3:40 PM")
  })

  test('sending names the campaign and links to it', () => {
    const view = heroView(sender({
      heroState: 'sending',
      sending: { id: 'c1', name: 'Weekend reminder', sent: 64, total: 212, finishAt: new Date(NOW + 270 * 60_000).toISOString() },
    }), false)
    expect(view.word).toBe('Sending')
    expect(view.sentence).toBe('Weekend reminder · 64 of 212 sent · done around 6:40 PM')
    expect(view.action).toEqual({ label: 'View', kind: 'campaign', campaignId: 'c1' })
  })

  test('none explains and offers the setup', () => {
    const view = heroView(sender({ heroState: 'none', primary: null, phones: [] }), false)
    expect(view.word).toBe('No phone yet')
    expect(view.action.kind).toBe('connect')
    expect(view.tone).toBe('grey')
  })

  test('late', () => {
    const late = phone({ state: 'late', lastSeenAt: new Date(NOW - 12 * 60_000).toISOString() })
    const view = heroView(sender({ heroState: 'late', primary: late, phones: [late] }), false)
    expect(view.word).toBe('Checking in late')
    expect(view.sentence).toBe("Haven't heard from Juan's Galaxy A15 in 12 min. Texts keep waiting until it checks in.")
  })

  test('offline with texts waiting is red', () => {
    const off = phone({ state: 'offline', lastSeenAt: '2026-10-14T06:14:00Z' })
    const view = heroView(sender({ heroState: 'offline', primary: off, phones: [off], waiting: 34 }), false)
    expect(view.word).toBe('Offline')
    expect(view.tone).toBe('red')
    expect(view.sentence).toBe("Juan's Galaxy A15 last checked in 2:14 PM · 34 texts waiting. Open SmartMenu on the phone and keep battery saver off.")
    expect(view.action).toEqual({ label: 'Fix it', kind: 'fix' })
  })

  test('offline with nothing waiting is amber', () => {
    const off = phone({ state: 'offline', lastSeenAt: null })
    expect(heroView(sender({ heroState: 'offline', primary: off, phones: [off] }), false).tone).toBe('amber')
  })

  test('resting during quiet hours', () => {
    const view = heroView(sender({
      heroState: 'resting', isQuietNow: true, waiting: 34, quietUntil: '2026-10-15T00:00:00Z',
    }), false)
    expect(view.word).toBe('Resting')
    expect(view.icon).toBe('moon')
    expect(view.sentence).toBe('Quiet hours until 8:00 AM, Philippine time. 34 texts go out then.')
  })

  test('resting with nothing waiting says so', () => {
    const view = heroView(sender({ heroState: 'resting', isQuietNow: true, quietUntil: '2026-10-15T00:00:00Z' }), false)
    expect(view.sentence).toBe('Quiet hours until 8:00 AM, Philippine time. Nothing waiting to send.')
  })

  test('unknown never says Ready', () => {
    const view = heroView(sender({ heroState: 'unknown' }), false)
    expect(view.word).toBe("Can't check")
    expect(view.action.kind).toBe('retry')
  })

  test('names the other phones when there are several', () => {
    const backup = phone({ deviceId: 'd2', name: 'Backup', state: 'offline' })
    const view = heroView(sender({ phones: [phone(), backup] }), false)
    expect(view.subLine).toBe('2 phones · Backup offline')
  })

  test('demo store says nothing is really sent', () => {
    expect(heroView(sender(), true).subLine).toBe('Demo store · nothing is really sent')
  })
})
