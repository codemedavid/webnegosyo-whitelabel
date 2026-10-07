import { mapKitOriginForRequest } from '@/lib/maps/apple/mapkit-origin'

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null }
}

describe('mapKitOriginForRequest', () => {
  const lookupNone = async () => null
  const lookupLigna = async (host: string) => (host === 'ligna.cafe' ? 'ligna' : null)

  it('serves every platform storefront host over https', async () => {
    await expect(
      mapKitOriginForRequest(headers({ host: 'seacook.webnegosyo.com' }), lookupNone),
    ).resolves.toBe('https://seacook.webnegosyo.com')
    await expect(mapKitOriginForRequest(headers({ host: 'smartmenu.ph' }), lookupNone)).resolves.toBe(
      'https://smartmenu.ph',
    )
  })

  it('keeps the port and plain http for local development', async () => {
    await expect(
      mapKitOriginForRequest(headers({ host: 'shop.localhost:3000', 'x-forwarded-proto': 'http' }), lookupNone),
    ).resolves.toBe('http://shop.localhost:3000')
  })

  it('accepts a verified custom domain, with or without www', async () => {
    await expect(mapKitOriginForRequest(headers({ host: 'www.ligna.cafe' }), lookupLigna)).resolves.toBe(
      'https://www.ligna.cafe',
    )
  })

  it('refuses a host that is neither the platform nor a known store domain', async () => {
    await expect(mapKitOriginForRequest(headers({ host: 'evil.example' }), lookupLigna)).resolves.toBeNull()
    await expect(mapKitOriginForRequest(headers({}), lookupLigna)).resolves.toBeNull()
  })

  it('refuses when the domain directory cannot answer', async () => {
    const failing = async () => {
      throw new Error('db down')
    }
    await expect(mapKitOriginForRequest(headers({ host: 'ligna.cafe' }), failing)).resolves.toBeNull()
  })
})
