/**
 * Turning an automation's message into one guest's text.
 *
 * An unknown placeholder must never reach a guest as a blank ("Hi , your  is
 * ready"), so the editor refuses it on save and the renderer refuses it at
 * send. A loyalty word in a win-back text is the same class of bug: the guest
 * has no card, so `{{rewardName}}` is only legal in a loyalty recipe.
 */

import {
  buildVariables,
  renderAutomationText,
  validateAutomationMessage,
  countSmsSegments,
} from '@/lib/sms-automations/template'
import type { Candidate, StoreContext } from '@/lib/sms-automations/types'

const STORE: StoreContext = { tenantId: 't1', storeName: 'Kape Ni Ana', baseUrl: 'https://kape.webnegosyo.com' }
const NOW = new Date('2026-10-12T04:00:00Z')

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    guest: {
      id: 'c1', name: 'Maria Santos', phone: '+639171234567', smsConsent: true, smsOptOut: false,
      orderCount: 4, totalSpent: 1250, firstOrderAt: '2026-08-01T02:00:00Z',
      lastOrderAt: '2026-09-02T02:00:00Z', favoriteItem: 'Spanish Latte',
    },
    occurrenceKey: 'k', dueAt: NOW.toISOString(), expiresAt: NOW.toISOString(),
    ...overrides,
  }
}

describe('buildVariables', () => {
  it('fills guest, store and link variables', () => {
    const vars = buildVariables(candidate(), STORE, { reviewUrl: 'https://g.page/r/abc' }, NOW)
    expect(vars).toMatchObject({
      firstName: 'Maria',
      storeName: 'Kape Ni Ana',
      orderCount: '4',
      favoriteItem: 'Spanish Latte',
      daysSinceLastOrder: '40',
      menuLink: 'https://kape.webnegosyo.com/menu',
      loyaltyLink: 'https://kape.webnegosyo.com/loyalty',
      reviewLink: 'https://g.page/r/abc',
    })
  })

  it('never leaves a greeting or favourite blank', () => {
    const vars = buildVariables(
      candidate({ guest: { ...candidate().guest, name: '  ', favoriteItem: null } }), STORE, { reviewUrl: null }, NOW,
    )
    expect(vars.firstName).toBe('there')
    expect(vars.favoriteItem).toBe('favorites')
  })

  it.each([
    ['khyle santos', 'Khyle'],
    ['Y', 'there'],
    ['09171234567', 'there'],
    ['.', 'there'],
    ['MARIA', 'MARIA'],
    ['Ñora', 'Ñora'],
  ])('greets %p as %p', (name, expected) => {
    const vars = buildVariables(candidate({ guest: { ...candidate().guest, name } }), STORE, { reviewUrl: null }, NOW)
    expect(vars.firstName).toBe(expected)
  })

  it('never lets a guest-typed name carry a link or a number into the store\'s text', () => {
    const vars = (name: string) => buildVariables(candidate({ guest: { ...candidate().guest, name } }), STORE, { reviewUrl: null }, NOW)
    expect(vars('Visit evil.example/win to claim 5000').name).toBe('Visit')
    expect(vars('Maria Santos-Cruz').name).toBe('Maria Santos-Cruz')
    expect(vars('Ma. Lourdes Reyes').name).toBe('Ma. Lourdes Reyes')
    expect(vars('0917 123 4567').name).toBe('there')
    expect(vars('Ana ' + 'B'.repeat(80)).name).toBe('Ana')
  })

  it('adds loyalty facts only when the candidate carries them', () => {
    const plain = buildVariables(candidate(), STORE, { reviewUrl: null }, NOW)
    expect(plain.rewardName).toBeUndefined()
    const loyal = buildVariables(candidate({
      loyalty: { progressLeft: '2 stamps', remaining: 2, rewardName: 'Free Iced Tea', rewardExpiresAt: '2026-10-20T00:00:00Z' },
    }), STORE, { reviewUrl: null }, NOW)
    expect(loyal).toMatchObject({ progressLeft: '2 stamps', stampsLeft: '2', rewardName: 'Free Iced Tea', rewardExpiryDate: 'Oct 20' })
  })
})

describe('renderAutomationText', () => {
  it('renders placeholders and appends the opt-out line', () => {
    const text = renderAutomationText(
      'Hi {{firstName}}, we miss you at {{storeName}}!', candidate(), STORE,
      { reviewUrl: null, optOutLine: 'Reply STOP to stop texts' }, NOW,
    )
    expect(text).toBe('Hi Maria, we miss you at Kape Ni Ana! Reply STOP to stop texts')
  })

  it('refuses a placeholder it cannot fill instead of sending a blank', () => {
    expect(() => renderAutomationText('Hi {{nickname}}', candidate(), STORE, { reviewUrl: null, optOutLine: null }, NOW))
      .toThrow(/nickname/)
  })

  it('refuses a review link the store never set', () => {
    expect(() => renderAutomationText('Review us {{reviewLink}}', candidate(), STORE, { reviewUrl: null, optOutLine: null }, NOW))
      .toThrow(/reviewLink/)
  })
})

describe('validateAutomationMessage', () => {
  it('accepts a recipe default-style message', () => {
    expect(validateAutomationMessage('win_back', 'Hi {{firstName}}, we miss you! {{menuLink}}')).toEqual({ ok: true })
  })

  it('rejects loyalty words outside a loyalty recipe', () => {
    const result = validateAutomationMessage('win_back', 'You are {{progressLeft}} away')
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/progressLeft/) })
  })

  it('rejects an unknown placeholder by name', () => {
    expect(validateAutomationMessage('review_request', 'Hi {{frist}}')).toEqual({ ok: false, error: expect.stringMatching(/frist/) })
  })

  it('rejects a blank or very long message', () => {
    expect(validateAutomationMessage('win_back', '   ').ok).toBe(false)
    expect(validateAutomationMessage('win_back', 'x'.repeat(461)).ok).toBe(false)
  })
})

describe('countSmsSegments', () => {
  it('counts GSM-7 and flips to UCS-2 on one emoji', () => {
    expect(countSmsSegments('a'.repeat(160))).toEqual({ length: 160, segments: 1, encoding: 'GSM7' })
    expect(countSmsSegments('a'.repeat(161)).segments).toBe(2)
    expect(countSmsSegments('Hi 🎉').encoding).toBe('UCS2')
  })
})
