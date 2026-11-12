import { accountRow, shouldShowAsk, wantsRegistration, type PushSnapshot } from './push-state'

const base: PushSnapshot = { permission: 'undetermined', choice: 'unset', isAskDismissed: false, canPush: true }

describe('shouldShowAsk', () => {
  it('asks a signed-in customer who was never asked', () => {
    expect(shouldShowAsk(base, true)).toBe(true)
  })

  it('never asks a guest, someone who said Not now, chose here, or already answered the phone', () => {
    expect(shouldShowAsk(base, false)).toBe(false)
    expect(shouldShowAsk({ ...base, isAskDismissed: true }, true)).toBe(false)
    expect(shouldShowAsk({ ...base, choice: 'off' }, true)).toBe(false)
    expect(shouldShowAsk({ ...base, permission: 'granted' }, true)).toBe(false)
    expect(shouldShowAsk({ ...base, permission: 'denied' }, true)).toBe(false)
  })
})

describe('wantsRegistration', () => {
  it('registers only an allowed, signed-in phone that did not switch it off and can get a token', () => {
    const allowed = { ...base, permission: 'granted' as const }
    expect(wantsRegistration(allowed, true)).toBe(true)
    expect(wantsRegistration({ ...allowed, choice: 'on' }, true)).toBe(true)
    expect(wantsRegistration(allowed, false)).toBe(false)
    expect(wantsRegistration({ ...allowed, choice: 'off' }, true)).toBe(false)
    expect(wantsRegistration({ ...allowed, canPush: false }, true)).toBe(false)
    expect(wantsRegistration(base, true)).toBe(false)
  })
})

describe('accountRow', () => {
  it('is a switch that reads on only when allowed and not switched off here', () => {
    expect(accountRow({ ...base, permission: 'granted' })).toMatchObject({ kind: 'switch', isOn: true })
    expect(accountRow({ ...base, permission: 'granted', choice: 'off' })).toMatchObject({ kind: 'switch', isOn: false })
    expect(accountRow(base)).toMatchObject({ kind: 'switch', isOn: false })
  })

  it('sends a phone that refused to its Settings, and says so in a build that cannot push', () => {
    expect(accountRow({ ...base, permission: 'denied' }).kind).toBe('settings')
    expect(accountRow({ ...base, canPush: false }).kind).toBe('unavailable')
  })
})
