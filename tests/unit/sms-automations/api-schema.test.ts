/**
 * The automations API's request contract. Everything the app, Owl or the MCP
 * sends is parsed here; a draft is only ever stored after `normalizeDraft`
 * has clamped its knobs and refused a message the engine cannot fill.
 */

import { normalizeDraft, normalizeSettings, parseAutomationRequest } from '@/lib/sms-automations/api/schema'

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const AUTOMATION = '1f6e1c3a-8a0e-4c62-9a53-4c3c0f1e2d11'

describe('parseAutomationRequest', () => {
  it('accepts every action with exactly its fields', () => {
    const ok = [
      { action: 'list', tenantId: TENANT },
      { action: 'save', tenantId: TENANT, automation: { recipe: 'win_back', messageTemplate: 'Hi {{firstName}}' } },
      { action: 'set_status', tenantId: TENANT, automationId: AUTOMATION, status: 'on', sendBacklog: true },
      { action: 'preview', tenantId: TENANT, automation: { recipe: 'win_back', messageTemplate: 'Hi', params: { inactiveDays: 45 } } },
      { action: 'run_now', tenantId: TENANT, automationId: AUTOMATION },
      { action: 'cancel_waiting', tenantId: TENANT },
      { action: 'activity', tenantId: TENANT, cursor: `2026-10-12T00:00:00.123+00:00~${AUTOMATION}`, limit: 20 },
      { action: 'save_settings', tenantId: TENANT, settings: {
        quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null,
      } },
    ]
    for (const body of ok) expect(parseAutomationRequest(body).success).toBe(true)
  })

  it('refuses unknown actions, extra keys and bad ids', () => {
    expect(parseAutomationRequest({ action: 'delete', tenantId: TENANT }).success).toBe(false)
    expect(parseAutomationRequest({ action: 'list', tenantId: TENANT, extra: 1 }).success).toBe(false)
    expect(parseAutomationRequest({ action: 'list', tenantId: 'shop' }).success).toBe(false)
    expect(parseAutomationRequest({ action: 'save', tenantId: TENANT, automation: { recipe: 'birthday', messageTemplate: 'x' } }).success).toBe(false)
    expect(parseAutomationRequest({ action: 'save', tenantId: TENANT, automation: { recipe: 'win_back', messageTemplate: 'x', params: { hack: 1 } } }).success).toBe(false)
  })

  it('refuses a cursor that could smuggle a filter', () => {
    expect(parseAutomationRequest({ action: 'activity', tenantId: TENANT, cursor: '2026-10-12T00:00:00Z),id.gt.(x' }).success).toBe(false)
  })

  it('caps the activity page size', () => {
    expect(parseAutomationRequest({ action: 'activity', tenantId: TENANT, limit: 1000 }).success).toBe(false)
  })
})

describe('normalizeDraft', () => {
  it('fills the defaults and clamps knobs into the recipe limits', () => {
    const result = normalizeDraft({ recipe: 'win_back', messageTemplate: '  Hi {{firstName}}!  ', params: { inactiveDays: 2, delayHours: 5 } })
    expect(result).toEqual({
      ok: true,
      draft: {
        recipe: 'win_back', name: 'We miss you', params: { inactiveDays: 7 }, messageTemplate: 'Hi {{firstName}}!',
        runMode: 'auto', reentryDays: null,
      },
    })
  })

  it('refuses a message with a word this recipe cannot fill', () => {
    const result = normalizeDraft({ recipe: 'win_back', messageTemplate: 'Your {{rewardName}} is waiting' })
    expect(result).toEqual({ ok: false, error: 'This automation can’t fill in: {{rewardName}}' })
  })
})

describe('normalizeSettings', () => {
  const base = { quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null }

  it('trims and keeps a clean review link', () => {
    expect(normalizeSettings({ ...base, reviewUrl: ' https://g.page/r/kape/review ', optOutLine: ' Reply STOP to stop texts ' })).toEqual({
      ok: true, settings: { ...base, reviewUrl: 'https://g.page/r/kape/review', optOutLine: 'Reply STOP to stop texts' },
    })
  })

  it('refuses links that are not https and opt-out lines that cost extra', () => {
    expect(normalizeSettings({ ...base, reviewUrl: 'http://g.page/r/kape' }).ok).toBe(false)
    expect(normalizeSettings({ ...base, reviewUrl: 'javascript:alert(1)' }).ok).toBe(false)
    expect(normalizeSettings({ ...base, optOutLine: 'Reply STOP 🙏' }).ok).toBe(false)
  })

  it('keeps a real quiet window', () => {
    expect(normalizeSettings({ ...base, quietHoursStart: '08:00', quietHoursEnd: '08:00' }).ok).toBe(false)
  })

  it('treats blank text as "none"', () => {
    expect(normalizeSettings({ ...base, reviewUrl: '  ', optOutLine: '' })).toEqual({ ok: true, settings: base })
  })
})
