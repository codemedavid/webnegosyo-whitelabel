import { generateKeyPairSync, verify } from 'node:crypto'
import { readMapKitConfig, signMapKitToken } from '@/lib/maps/apple/mapkit-token'

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

describe('signMapKitToken', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const config = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem }
  const now = new Date('2026-10-06T00:00:00Z')

  it('signs an ES256 JWT that Apple can verify with the key id in the header', () => {
    // Arrange + Act
    const token = signMapKitToken(config, { now, ttlSeconds: 1800 })
    const [header, payload, signature] = token.split('.')

    // Assert
    expect(decodeSegment(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' })
    expect(decodeSegment(payload)).toEqual({ iss: 'TEAM123456', iat: 1791244800, exp: 1791246600 })
    const isValid = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    )
    expect(isValid).toBe(true)
  })

  it('binds a browser token to the page origin', () => {
    const token = signMapKitToken(config, { now, ttlSeconds: 60, origin: 'https://shop.webnegosyo.com' })
    expect(decodeSegment(token.split('.')[1]).origin).toBe('https://shop.webnegosyo.com')
  })
})

describe('readMapKitConfig', () => {
  it('is null until all three values are set', () => {
    expect(readMapKitConfig({ APPLE_MAPKIT_TEAM_ID: 'T', APPLE_MAPKIT_KEY_ID: 'K' })).toBeNull()
    expect(readMapKitConfig({})).toBeNull()
  })

  it('restores newlines in a key pasted into an env var as one line', () => {
    const config = readMapKitConfig({
      APPLE_MAPKIT_TEAM_ID: ' T ',
      APPLE_MAPKIT_KEY_ID: 'K',
      APPLE_MAPKIT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
    })
    expect(config).toEqual({
      teamId: 'T',
      keyId: 'K',
      privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    })
  })
})
