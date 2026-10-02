import { buildWalletPassContent } from '@/lib/loyalty/wallet-pass/content'
import { buildApplePassJson, hexToAppleRgb } from '@/lib/loyalty/wallet-pass/apple-pass-json'
import { parseAppleWebServiceRoute } from '@/lib/loyalty/wallet-pass/apple-ws-route'
import type { LoyaltyProgram } from '@/lib/loyalty/types'

const PROGRAM = {
  id: 'program-1',
  tenantId: 'tenant-1',
  name: 'Coffee Club',
  scope: 'business',
  outletId: null,
  status: 'active',
  activatesAt: '2026-01-01T00:00:00Z',
  endsAt: null,
  version: {
    id: 'v1', version: 1, createdAt: '2026-01-01T00:00:00Z',
    rules: {
      earnMode: 'stamp', threshold: 10, pointsPerPeso: null, minSpend: null,
      reward: { type: 'fixed', amount: 100 }, rewardExpiryDays: 30, isExclusive: true,
    },
  },
} as LoyaltyProgram

const SERIAL = 'B'.repeat(24)
const content = buildWalletPassContent({
  serial: SERIAL,
  storeName: 'Kape Co.',
  logoUrl: null,
  storeUrl: 'https://kape.webnegosyo.com/menu',
  colors: { background: '#1F6F43', text: '#FFFFFF' },
  program: PROGRAM,
  balance: 4,
  rewardExpiries: ['2026-10-05T00:00:00Z'],
  nowMs: Date.parse('2026-09-29T00:00:00Z'),
})
const OPTIONS = {
  passTypeIdentifier: 'pass.com.webnegosyo.loyalty',
  teamIdentifier: 'ABCDE12345',
  webServiceURL: 'https://www.webnegosyo.com/api/loyalty/passes/apple-ws',
  authenticationToken: 'f'.repeat(64),
}

describe('buildApplePassJson', () => {
  const pass = buildApplePassJson(content, OPTIONS)

  test('is a store card wired to our web service', () => {
    expect(pass.formatVersion).toBe(1)
    expect(pass.serialNumber).toBe(SERIAL)
    expect(pass.passTypeIdentifier).toBe(OPTIONS.passTypeIdentifier)
    expect(pass.teamIdentifier).toBe(OPTIONS.teamIdentifier)
    expect(pass.webServiceURL).toBe(OPTIONS.webServiceURL)
    expect(pass.authenticationToken).toBe(OPTIONS.authenticationToken)
    expect(pass.storeCard).toBeDefined()
  })

  test('paints the store’s colours in Apple’s rgb() form', () => {
    expect(pass.backgroundColor).toBe('rgb(31, 111, 67)')
    expect(pass.foregroundColor).toBe('rgb(255, 255, 255)')
  })

  test('the QR is the member code the POS scans', () => {
    expect(pass.barcodes).toEqual([
      expect.objectContaining({ format: 'PKBarcodeFormatQR', message: `WNLC1.${SERIAL}`, messageEncoding: 'iso-8859-1' }),
    ])
  })

  test('balance and reward fields announce changes on the lock screen', () => {
    const fields = [
      ...pass.storeCard.headerFields,
      ...pass.storeCard.primaryFields,
      ...pass.storeCard.secondaryFields,
    ]
    const balance = fields.find((f) => f.key === 'balance')
    expect(balance?.value).toBe('4 / 10')
    expect(balance?.changeMessage).toContain('%@')
    const headline = fields.find((f) => f.key === 'headline')
    expect(headline?.changeMessage).toContain('%@')
  })

  test('shows when the nearest reward expires', () => {
    const expiry = pass.storeCard.auxiliaryFields.find((f) => f.key === 'expires')
    expect(expiry?.value).toBe('2026-10-05T00:00:00.000Z')
    expect(expiry?.dateStyle).toBe('PKDateStyleMedium')
  })

  test('a stamp card leaves the strip to the stamp grid and states the offer under it', () => {
    const earning = buildApplePassJson({
      ...content,
      rewardsAvailable: 0,
      nextRewardExpiresAt: null,
      headline: { label: 'NEXT REWARD', value: '₱100 off' },
    }, OPTIONS)
    expect(earning.storeCard.primaryFields).toEqual([])
    expect(earning.storeCard.secondaryFields).toEqual([
      expect.objectContaining({ key: 'headline', label: 'OFFER', value: 'Collect 10 stamps, get ₱100 off' }),
    ])
    expect(earning.storeCard.auxiliaryFields).toEqual([])
  })

  test('a ready reward replaces the offer line', () => {
    expect(pass.storeCard.primaryFields).toEqual([])
    expect(pass.storeCard.secondaryFields).toEqual([
      expect.objectContaining({ key: 'headline', label: 'REWARD READY', value: '₱100 off' }),
    ])
  })

  test('a points card keeps the big headline because it has no stamp grid', () => {
    const points = buildApplePassJson({ ...content, stampCard: null }, OPTIONS)
    expect(points.storeCard.primaryFields).toEqual([expect.objectContaining({ key: 'headline', label: 'REWARDS READY' })])
  })

  test('never embeds a phone number', () => {
    expect(JSON.stringify(pass)).not.toMatch(/\+639|phone:/)
  })
})

test('a store name cannot inject markup into the back-of-card link', () => {
  const hostile = buildWalletPassContent({
    serial: SERIAL,
    storeName: 'Kape"><a href="https://evil.test">Click</a><span style="color:red',
    logoUrl: null,
    storeUrl: 'https://kape.webnegosyo.com/menu',
    colors: { background: '#1F6F43', text: '#FFFFFF' },
    program: PROGRAM,
    balance: 1,
    rewardExpiries: [],
    nowMs: Date.parse('2026-09-29T00:00:00Z'),
  })
  const link = buildApplePassJson(hostile, OPTIONS).storeCard.backFields.find((f) => f.key === 'store')
  expect(link?.attributedValue).toBe(
    '<a href="https://kape.webnegosyo.com/menu">Kape&quot;&gt;&lt;a href=&quot;https://evil.test&quot;&gt;Click&lt;/a&gt;&lt;span style=&quot;color:red</a>',
  )
})

describe('hexToAppleRgb', () => {
  test('converts #RRGGBB', () => {
    expect(hexToAppleRgb('#000000')).toBe('rgb(0, 0, 0)')
    expect(hexToAppleRgb('#FFaa10')).toBe('rgb(255, 170, 16)')
  })
})

describe('parseAppleWebServiceRoute', () => {
  const device = 'a1b2c3d4e5'
  const type = 'pass.com.webnegosyo.loyalty'

  test('register / unregister a device for a pass', () => {
    const path = ['v1', 'devices', device, 'registrations', type, SERIAL]
    expect(parseAppleWebServiceRoute('POST', path)).toEqual({ kind: 'register', deviceId: device, passTypeId: type, serial: SERIAL })
    expect(parseAppleWebServiceRoute('DELETE', path)).toEqual({ kind: 'unregister', deviceId: device, passTypeId: type, serial: SERIAL })
  })

  test('list the serials that changed for a device', () => {
    expect(parseAppleWebServiceRoute('GET', ['v1', 'devices', device, 'registrations', type]))
      .toEqual({ kind: 'list_updated', deviceId: device, passTypeId: type })
  })

  test('fetch the latest pass', () => {
    expect(parseAppleWebServiceRoute('GET', ['v1', 'passes', type, SERIAL]))
      .toEqual({ kind: 'latest_pass', passTypeId: type, serial: SERIAL })
  })

  test('device log', () => {
    expect(parseAppleWebServiceRoute('POST', ['v1', 'log'])).toEqual({ kind: 'log' })
  })

  test.each([
    ['GET', ['v1', 'log']],
    ['PUT', ['v1', 'passes', type, SERIAL]],
    ['GET', ['v2', 'passes', type, SERIAL]],
    ['GET', ['v1', 'passes', type, 'not a serial']],
    ['POST', ['v1', 'devices', 'x'.repeat(200), 'registrations', type, SERIAL]],
    ['GET', ['v1', 'passes', 'bad type!', SERIAL]],
  ])('%s %j is unknown', (method, path) => {
    expect(parseAppleWebServiceRoute(method as string, path as string[])).toEqual({ kind: 'unknown' })
  })
})
