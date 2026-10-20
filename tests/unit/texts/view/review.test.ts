import { afterSendToast, footerPhoneState, phoneNote, primaryLabel, repeatLabel, reviewHeading, savedChangesToast, waitText } from '@/lib/texts/view/review'

const NOW = Date.parse('2026-10-14T02:00:00Z') // Wed 10:00 AM Manila

describe('composer review + footer', () => {
  test('phone state', () => {
    expect(footerPhoneState('sending')).toBe('ready')
    expect(footerPhoneState('resting')).toBe('quiet')
    expect(footerPhoneState('unknown')).toBe('offline')
    expect(footerPhoneState('none')).toBe('none')
  })

  test('primary button follows the spec table', () => {
    expect(primaryLabel({ when: 'now', phone: 'ready', reach: 148, quietUntil: null })).toBe('Send to 148 guests')
    expect(primaryLabel({ when: 'now', phone: 'quiet', reach: 148, quietUntil: Date.parse('2026-10-15T00:00:00Z') })).toBe('Send at 8:00 AM')
    expect(primaryLabel({ when: 'later', phone: 'offline', reach: 1, quietUntil: null })).toBe('Schedule')
    expect(primaryLabel({ when: 'repeat', phone: 'ready', reach: 1, quietUntil: null })).toBe('Start repeating')
    expect(primaryLabel({ when: 'now', phone: 'none', reach: 1, quietUntil: null })).toBe('Save and schedule')
    expect(phoneNote('offline')).toBe("Your phone is offline. Texts wait until it's back on.")
    expect(phoneNote('ready')).toBeNull()
  })

  test('heading', () => {
    expect(reviewHeading({ reach: 148, preset: 'regulars', when: 'now', startAt: NOW, now: NOW, phoneName: "Juan's Galaxy A15", repeatLabel: '' }))
      .toBe("Text 148 regulars now, from Juan's Galaxy A15.")
    expect(reviewHeading({ reach: 20, preset: 'everyone', when: 'later', startAt: NOW + 2 * 86_400_000, now: NOW, phoneName: null, repeatLabel: '' }))
      .toBe('Text 20 guests Fri, 10:00 AM.')
    expect(repeatLabel('weekly', [5], 14, '10:00')).toBe('every Fri, 10:00 AM')
  })

  test('toasts', () => {
    expect(afterSendToast({ when: 'now', phone: 'ready', queued: 148, finishAt: NOW + 3 * 3_600_000, startAt: NOW, now: NOW, repeat: '' }))
      .toBe('Sending to 148 guests. Done around 1:00 PM.')
    expect(afterSendToast({ when: 'later', phone: 'ready', queued: 0, finishAt: null, startAt: NOW + 2 * 86_400_000, now: NOW, repeat: '' }))
      .toBe('Scheduled for Fri, 10:00 AM.')
    expect(afterSendToast({ when: 'now', phone: 'none', queued: 0, finishAt: null, startAt: NOW, now: NOW, repeat: '' }))
      .toBe('Saved. It goes out once your phone connects.')
  })

  test('away phone: no done-times, honest waits', () => {
    expect(afterSendToast({ when: 'now', phone: 'offline', queued: 148, finishAt: NOW, startAt: NOW, now: NOW, repeat: '' }))
      .toBe('Queued for 148 guests. They go out once your phone is back.')
    expect(waitText("Juan's Galaxy A15", '2026-10-14T01:30:00Z', NOW)).toBe("Texts wait until Juan's Galaxy A15 checks in (last seen 9:30 AM).")
    expect(waitText(null, null, NOW)).toBe('Texts wait until your phone checks in.')
    expect(reviewHeading({ reach: 148, preset: 'regulars', when: 'now', startAt: NOW, now: NOW, phoneName: null, repeatLabel: '', phone: 'none' }))
      .toBe('Save a text for 148 regulars. It goes out once you connect a phone.')
  })

  test('saving a live campaign keeps it live', () => {
    expect(savedChangesToast({ displayState: 'scheduled', when: 'later', startAt: NOW + 2 * 86_400_000, now: NOW, repeat: '' }))
      .toBe('Saved. Still scheduled for Fri, 10:00 AM.')
    expect(savedChangesToast({ displayState: 'repeating', when: 'repeat', startAt: NOW, now: NOW, repeat: 'every Fri, 10:00 AM' }))
      .toBe('Saved. Still repeating every Fri, 10:00 AM.')
    expect(savedChangesToast({ displayState: 'paused', when: 'later', startAt: NOW, now: NOW, repeat: '' })).toBe('Saved.')
  })
})
