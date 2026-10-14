/**
 * `x-wn-phone-info`: what the sending phone says about itself on its outbox
 * claim. The header is attacker-controllable text until the claim RPC has
 * authenticated the device, and even then it is only the phone's word, so the
 * parser is strict: bounded, control characters stripped, null on anything
 * structurally wrong, and a field it cannot use is simply absent.
 */

import { MAX_PHONE_INFO_HEADER_CHARS, parsePhoneInfoHeader } from '@/lib/texts/phone-info'

const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value))
const FULL = { manufacturer: 'samsung', model: 'SM-A155F', os: '14', app: '1.0.13', sms: true, bat: false }

describe('parsePhoneInfoHeader', () => {
  it('reads a full report', () => {
    expect(parsePhoneInfoHeader(encode(FULL))).toEqual({
      manufacturer: 'samsung', model: 'SM-A155F', osVersion: '14', appVersion: '1.0.13',
      smsPermission: true, isBatteryUnrestricted: false,
    })
  })

  it('treats omitted fields as unknown', () => {
    expect(parsePhoneInfoHeader(encode({ model: 'Pixel 7' }))).toEqual({
      manufacturer: null, model: 'Pixel 7', osVersion: null, appVersion: null, smsPermission: null, isBatteryUnrestricted: null,
    })
  })

  it.each([
    ['missing', null],
    ['empty', ''],
    ['not URI-encoded JSON', '%E0%A4%A'],
    ['not JSON', encodeURIComponent('model=Pixel')],
    ['an array', encode(['samsung'])],
    ['a wrong type', encode({ ...FULL, sms: 'yes' })],
    ['a number for a string', encode({ model: 7 })],
    ['an absurdly long value', encode({ model: 'x'.repeat(500) })],
    ['nothing usable', encode({})],
  ])('is null for %s', (_label, raw) => {
    expect(parsePhoneInfoHeader(raw as string | null)).toBeNull()
  })

  it('refuses an oversized header before decoding it', () => {
    expect(parsePhoneInfoHeader('a'.repeat(MAX_PHONE_INFO_HEADER_CHARS + 1))).toBeNull()
  })

  it('strips control characters and squeezes whitespace', () => {
    const info = parsePhoneInfoHeader(encode({ manufacturer: ' sam\u0000sung\n', model: 'Galaxy\t\tA15‮' }))
    expect(info).toMatchObject({ manufacturer: 'samsung', model: 'Galaxy A15' })
  })

  it('cuts each field to its column bound', () => {
    const info = parsePhoneInfoHeader(encode({ manufacturer: 'm'.repeat(80), model: 'n'.repeat(100), os: '1'.repeat(30) }))
    expect(info?.manufacturer).toHaveLength(40)
    expect(info?.model).toHaveLength(60)
    expect(info?.osVersion).toHaveLength(20)
  })

  it('drops an app version that is not a version number', () => {
    expect(parsePhoneInfoHeader(encode({ app: '<script>', model: 'Pixel' }))?.appVersion).toBeNull()
    expect(parsePhoneInfoHeader(encode({ app: '1.0.14-beta.2' }))?.appVersion).toBe('1.0.14-beta.2')
  })

  it('ignores keys it does not know (a newer app may say more)', () => {
    expect(parsePhoneInfoHeader(encode({ ...FULL, battery: 64 }))).not.toBeNull()
  })
})
