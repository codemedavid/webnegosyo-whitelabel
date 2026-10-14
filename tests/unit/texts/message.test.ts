/**
 * Campaign messages: the app's {{placeholder}} shape, the automation
 * renderer's guest-safe values, the store's opt-out line on every text, and
 * a refusal (null) rather than a blank whenever a value is missing.
 */

import {
  CAMPAIGN_VARIABLES, MAX_CAMPAIGN_SEGMENTS, estimateCampaignSegments, renderCampaignMessage, validateCampaignTemplate,
} from '@/lib/texts/message'
import { knownVariableNames, renderMessage } from '../../../webnegosyo-app/lib/sms/message-template'
import { guest } from './fixtures'

const STORE = { storeName: 'Juan’s Grill' }

describe('renderCampaignMessage', () => {
  test('fills the guest and store values and appends the opt-out line', () => {
    const body = renderCampaignMessage('Hi {{firstName}}! {{ storeName }} misses you.', guest({ id: '1' }), STORE, { optOutLine: 'Reply STOP to opt out' })
    expect(body).toBe("Hi Maria! Juan's Grill misses you. Reply STOP to opt out")
  })

  test('matches the app renderer for well-formed guests (no opt-out line)', () => {
    const template = 'Hi {{firstName}} ({{name}}), {{orderCount}} orders, {{totalSpent}} spent, last {{lastOrderDate}} at {{storeName}}'
    const customer = guest({ id: '2', name: 'Jose Rizal', last_order_at: '2026-10-01T03:00:00Z' })
    expect(renderCampaignMessage(template, customer, { storeName: 'Kainan' }, { optOutLine: null }))
      .toBe(renderMessage(template, customer, { storeName: 'Kainan' }))
  })

  test('refuses (null) when a value is missing or the variable is unknown', () => {
    expect(renderCampaignMessage('Last seen {{lastOrderDate}}', guest({ id: '3', last_order_at: null }), STORE, { optOutLine: null })).toBeNull()
    expect(renderCampaignMessage('Use {{discount}}', guest({ id: '3' }), STORE, { optOutLine: null })).toBeNull()
    expect(renderCampaignMessage('Menu {{menuLink}}', guest({ id: '3' }), STORE, { optOutLine: null })).toBeNull()
  })

  test('a junk name falls back to "there" instead of texting it', () => {
    expect(renderCampaignMessage('Hi {{firstName}}', guest({ id: '4', name: 'Y' }), STORE, { optOutLine: null })).toBe('Hi there')
  })

  test('automation-only words (favorite item, links) are refused', () => {
    expect(renderCampaignMessage('Your {{favoriteItem}}', guest({ id: '5' }), STORE, { optOutLine: null })).toBeNull()
  })
})

describe('validateCampaignTemplate', () => {
  test('accepts exactly the app variables (the composer chips)', () => {
    expect([...CAMPAIGN_VARIABLES].sort()).toEqual(knownVariableNames().sort())
    expect(validateCampaignTemplate('Hi {{firstName}}, {{orderCount}} orders at {{storeName}}')).toEqual({ ok: true })
    expect(validateCampaignTemplate('Try {{favoriteItem}}').ok).toBe(false)
  })

  test('explains what is wrong in words an owner can act on', () => {
    expect(validateCampaignTemplate('   ')).toEqual({ ok: false, error: 'Write a message first.' })
    expect(validateCampaignTemplate('Get {{discount}} now')).toEqual({ ok: false, error: "We don't know {{discount}}. Use the chips above." })
    expect(validateCampaignTemplate('x'.repeat(460)).ok).toBe(false)
  })
})

describe('estimateCampaignSegments', () => {
  test('counts the opt-out line', () => {
    const template = 'a'.repeat(150)
    expect(estimateCampaignSegments(template, null)).toBe(1)
    expect(estimateCampaignSegments(template, 'Reply STOP to opt out')).toBe(2)
  })

  test('an emoji switches the whole text to the costly alphabet', () => {
    expect(estimateCampaignSegments(`${'a'.repeat(80)} 😊`, null)).toBe(2)
  })

  test('the hard ceiling is three texts', () => {
    expect(MAX_CAMPAIGN_SEGMENTS).toBe(3)
  })
})
