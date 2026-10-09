import { generateKeyPairSync, verify } from 'node:crypto'
import { signSnapshotUrl } from '@/lib/maps/apple/snapshot-url'

describe('signSnapshotUrl', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const config = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem }

  it('signs its own path and query so Apple can verify it', () => {
    // Arrange + Act
    const url = signSnapshotUrl(config, { center: { lat: 14.5547, lng: 121.0244 }, width: 320, height: 160 })
    const [signedPart, signature] = url.split('&signature=')
    const signedPath = signedPart.replace('https://snapshot.apple-mapkit.com', '')

    // Assert
    expect(signedPath.startsWith('/api/v1/snapshot?')).toBe(true)
    const isValid = verify(
      'sha256',
      Buffer.from(signedPath),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    )
    expect(isValid).toBe(true)
  })

  it('pins the centre, names the team and key, and clamps the size to Apple limits', () => {
    const url = new URL(signSnapshotUrl(config, { center: { lat: 14.5, lng: 121 }, width: 2000, height: 10 }))

    expect(url.searchParams.get('center')).toBe('14.500000,121.000000')
    expect(url.searchParams.get('size')).toBe('640x50')
    expect(url.searchParams.get('teamId')).toBe('TEAM123456')
    expect(url.searchParams.get('keyId')).toBe('KEY1234567')
    expect(JSON.parse(url.searchParams.get('annotations') ?? '[]')).toEqual([
      { point: '14.500000,121.000000', color: 'e4572e' },
    ])
  })
})
