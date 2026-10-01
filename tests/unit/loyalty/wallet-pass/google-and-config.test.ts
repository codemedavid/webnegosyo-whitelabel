import { buildWalletPassContent } from '@/lib/loyalty/wallet-pass/content'
import {
  buildGoogleLoyaltyClass,
  buildGoogleLoyaltyObject,
  buildGoogleSaveClaims,
  googleWalletIds,
} from '@/lib/loyalty/wallet-pass/google-objects'
import { loadWalletConfig } from '@/lib/loyalty/wallet-pass/config'
import type { LoyaltyProgram } from '@/lib/loyalty/types'

const SERIAL = 'C'.repeat(23) + '-'
const PROGRAM = {
  id: '9f1c2a8e-1111-4222-8333-444455556666',
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
      earnMode: 'stamp', threshold: 8, pointsPerPeso: null, minSpend: null,
      reward: { type: 'percent', percent: 20, maxAmount: null }, rewardExpiryDays: null, isExclusive: true,
    },
  },
} as LoyaltyProgram

const content = buildWalletPassContent({
  serial: SERIAL,
  storeName: 'Kape Co.',
  logoUrl: 'https://img.example.com/logo.png',
  storeUrl: 'https://kape.webnegosyo.com/menu',
  colors: { background: '#1F6F43', text: '#FFFFFF' },
  program: PROGRAM,
  balance: 2,
  rewardExpiries: [],
  nowMs: Date.parse('2026-09-29T00:00:00Z'),
})
const ISSUER = '3388000000012345678'
const FALLBACK_LOGO = 'https://www.webnegosyo.com/wallet/logo.png'

describe('googleWalletIds', () => {
  test('ids are issuer-prefixed and use only allowed characters', () => {
    const ids = googleWalletIds(ISSUER, PROGRAM.id, SERIAL)
    expect(ids.classId).toBe(`${ISSUER}.wn_program_9f1c2a8e111142228333444455556666`)
    expect(ids.objectId).toBe(`${ISSUER}.wn_member_${SERIAL}`)
    expect(ids.objectId).toMatch(/^[0-9]+\.[A-Za-z0-9._-]+$/)
  })
})

describe('Google loyalty objects', () => {
  const ids = googleWalletIds(ISSUER, PROGRAM.id, SERIAL)

  test('the class carries the programme and a logo (falling back when the store has none)', () => {
    const klass = buildGoogleLoyaltyClass(content, { classId: ids.classId, fallbackLogoUrl: FALLBACK_LOGO })
    expect(klass).toEqual(expect.objectContaining({
      id: ids.classId,
      issuerName: 'Kape Co.',
      programName: 'Coffee Club',
      reviewStatus: 'UNDER_REVIEW',
      hexBackgroundColor: '#1F6F43',
    }))
    expect(klass.programLogo.sourceUri.uri).toBe('https://img.example.com/logo.png')

    const bare = buildGoogleLoyaltyClass({ ...content, logoUrl: null }, { classId: ids.classId, fallbackLogoUrl: FALLBACK_LOGO })
    expect(bare.programLogo.sourceUri.uri).toBe(FALLBACK_LOGO)
  })

  test('the object shows the balance and the member QR', () => {
    const object = buildGoogleLoyaltyObject(content, ids)
    expect(object.id).toBe(ids.objectId)
    expect(object.classId).toBe(ids.classId)
    expect(object.state).toBe('ACTIVE')
    expect(object.loyaltyPoints).toEqual({ label: 'Stamps', balance: { string: '2 / 8' } })
    expect(object.barcode).toEqual(expect.objectContaining({ type: 'QR_CODE', value: `WNLC1.${SERIAL}` }))
    expect(JSON.stringify(object)).not.toMatch(/\+639|phone:/)
  })

  test('an ended programme leaves the pass readable but inactive', () => {
    const object = buildGoogleLoyaltyObject({ ...content, programStatus: 'ended' }, ids)
    expect(object.state).toBe('INACTIVE')
  })

  test('save claims name the pre-written object only, keeping the link short', () => {
    const claims = buildGoogleSaveClaims({
      serviceAccountEmail: 'wallet@project.iam.gserviceaccount.com',
      origins: ['https://www.webnegosyo.com'],
      objectId: ids.objectId,
      issuedAtSeconds: 1_790_000_000,
    })
    expect(claims).toEqual({
      iss: 'wallet@project.iam.gserviceaccount.com',
      aud: 'google',
      typ: 'savetowallet',
      iat: 1_790_000_000,
      origins: ['https://www.webnegosyo.com'],
      payload: { loyaltyObjects: [{ id: ids.objectId }] },
    })
  })
})

describe('loadWalletConfig', () => {
  const b64 = (value: string) => Buffer.from(value).toString('base64')
  const serviceAccount = b64(JSON.stringify({
    client_email: 'wallet@project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  }))
  const appleEnv = {
    APPLE_WALLET_PASS_TYPE_ID: 'pass.com.webnegosyo.loyalty',
    APPLE_WALLET_TEAM_ID: 'ABCDE12345',
    APPLE_WALLET_CERT_PEM_B64: b64('-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----'),
    APPLE_WALLET_KEY_PEM_B64: b64('-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----'),
    APPLE_WALLET_WWDR_PEM_B64: b64('-----BEGIN CERTIFICATE-----\ny\n-----END CERTIFICATE-----'),
    WALLET_PASS_AUTH_SECRET: Buffer.alloc(32, 3).toString('base64'),
  }

  test('nothing configured means neither wallet is offered', () => {
    const config = loadWalletConfig({})
    expect(config.apple).toBeNull()
    expect(config.google).toBeNull()
    expect(config.publicBaseUrl).toBe('https://www.webnegosyo.com')
  })

  test('a complete Apple configuration is loaded', () => {
    const config = loadWalletConfig(appleEnv)
    expect(config.apple).toEqual(expect.objectContaining({
      passTypeIdentifier: 'pass.com.webnegosyo.loyalty',
      teamIdentifier: 'ABCDE12345',
      webServiceURL: 'https://www.webnegosyo.com/api/loyalty/passes/apple-ws',
    }))
    expect(config.apple?.signerCert).toContain('BEGIN CERTIFICATE')
    expect(config.apple?.authSecret).toHaveLength(32)
  })

  test('Apple fails closed when any piece is missing or weak', () => {
    expect(loadWalletConfig({ ...appleEnv, APPLE_WALLET_WWDR_PEM_B64: '' }).apple).toBeNull()
    expect(loadWalletConfig({ ...appleEnv, WALLET_PASS_AUTH_SECRET: 'short' }).apple).toBeNull()
    expect(loadWalletConfig({ ...appleEnv, APPLE_WALLET_CERT_PEM_B64: b64('not a pem') }).apple).toBeNull()
    expect(loadWalletConfig({ ...appleEnv, APPLE_WALLET_PASS_TYPE_ID: 'com.wrong' }).apple).toBeNull()
  })

  test('Google loads from a service-account key and a numeric issuer id', () => {
    const config = loadWalletConfig({
      GOOGLE_WALLET_ISSUER_ID: ISSUER,
      GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_B64: serviceAccount,
    })
    expect(config.google).toEqual(expect.objectContaining({
      issuerId: ISSUER,
      serviceAccountEmail: 'wallet@project.iam.gserviceaccount.com',
    }))
  })

  test('Google fails closed on a bad key or issuer', () => {
    expect(loadWalletConfig({ GOOGLE_WALLET_ISSUER_ID: 'abc', GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_B64: serviceAccount }).google).toBeNull()
    expect(loadWalletConfig({ GOOGLE_WALLET_ISSUER_ID: ISSUER, GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_B64: b64('{}') }).google).toBeNull()
    expect(loadWalletConfig({ GOOGLE_WALLET_ISSUER_ID: ISSUER, GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_B64: '%%%' }).google).toBeNull()
  })

  test('the public base URL must be https and loses its trailing slash', () => {
    expect(loadWalletConfig({ WALLET_PUBLIC_BASE_URL: 'https://example.com/' }).publicBaseUrl).toBe('https://example.com')
    expect(loadWalletConfig({ WALLET_PUBLIC_BASE_URL: 'http://example.com' }).publicBaseUrl).toBe('https://www.webnegosyo.com')
  })
})
