/** @jest-environment node */
import { resolveShortMapLink, type LinkFetch } from '@/lib/maps/resolve-map-link'

function redirects(...locations: Array<string | null>): { fetchImpl: LinkFetch; urls: string[] } {
  const urls: string[] = []
  const fetchImpl: LinkFetch = async (url) => {
    urls.push(url)
    const location = locations.shift() ?? null
    return { status: location ? 302 : 200, headers: { get: () => location } }
  }
  return { fetchImpl, urls }
}

const SHORT = 'https://maps.app.goo.gl/AbC123'

describe('resolveShortMapLink', () => {
  it('reads the spot from the first redirect and fetches nothing else', async () => {
    const { fetchImpl, urls } = redirects('https://www.google.com/maps/place/X/data=!3d15.66!4d120.58')
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toEqual({ kind: 'point', point: { lat: 15.66, lng: 120.58 } })
    expect(urls).toEqual([SHORT])
  })

  it('follows one short link to another', async () => {
    const { fetchImpl, urls } = redirects('https://goo.gl/maps/Next', 'https://maps.google.com/?q=15.66,120.58')
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toEqual({ kind: 'point', point: { lat: 15.66, lng: 120.58 } })
    expect(urls).toEqual([SHORT, 'https://goo.gl/maps/Next'])
  })

  it("looks inside Google's consent page without fetching it", async () => {
    const wrapped = `https://consent.google.com/m?continue=${encodeURIComponent('https://www.google.com/maps/@15.66,120.58,17z')}`
    const { fetchImpl, urls } = redirects(wrapped)
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toEqual({ kind: 'point', point: { lat: 15.66, lng: 120.58 } })
    expect(urls).toHaveLength(1)
  })

  it('reads a place name as words to search', async () => {
    const { fetchImpl } = redirects('https://maps.google.com/?q=Paniqui+Public+Market')
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toEqual({ kind: 'query', query: 'Paniqui Public Market' })
  })

  it('never follows a redirect to any other host', async () => {
    const { fetchImpl, urls } = redirects('http://169.254.169.254/latest/meta-data', 'https://maps.google.com/?q=1.5,2.5')
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toBeNull()
    expect(urls).toEqual([SHORT])
  })

  it('gives up on an endless chain', async () => {
    const { fetchImpl, urls } = redirects(...Array.from({ length: 10 }, (_, index) => `https://goo.gl/maps/${index}`))
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toBeNull()
    expect(urls).toHaveLength(4)
  })

  it('returns null when the link does not redirect', async () => {
    const { fetchImpl } = redirects(null)
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toBeNull()
  })
})

describe('resolveShortMapLink: hardening', () => {
  it('refuses to fetch a first link that is not a Google short map link', async () => {
    const { fetchImpl, urls } = redirects('https://maps.google.com/?q=15.66,120.58')
    await expect(resolveShortMapLink('http://169.254.169.254/latest/meta-data', fetchImpl)).resolves.toBeNull()
    await expect(resolveShortMapLink('https://goo.gl/notmaps', fetchImpl)).resolves.toBeNull()
    expect(urls).toEqual([])
  })

  it('normalises the first link before fetching it (no port, no credentials)', async () => {
    const { fetchImpl, urls } = redirects('https://maps.google.com/?q=15.66,120.58')
    await resolveShortMapLink('https://user:pw@maps.app.goo.gl:8443/AbC123?g_st=ic', fetchImpl)
    expect(urls).toEqual(['https://maps.app.goo.gl/AbC123?g_st=ic'])
  })

  it('discards every response body it never reads, so no socket is left open', async () => {
    const cancel = jest.fn(async () => undefined)
    const locations = ['https://goo.gl/maps/Next', 'https://maps.google.com/?q=15.66,120.58']
    const fetchImpl: LinkFetch = async () => ({
      status: 302,
      headers: { get: () => locations.shift() ?? null },
      body: { cancel },
    })
    await resolveShortMapLink(SHORT, fetchImpl)
    expect(cancel).toHaveBeenCalledTimes(2)
  })

  it('still answers when discarding a body fails', async () => {
    const fetchImpl: LinkFetch = async () => ({
      status: 302,
      headers: { get: () => 'https://maps.google.com/?q=15.66,120.58' },
      body: { cancel: async () => { throw new Error('already closed') } },
    })
    await expect(resolveShortMapLink(SHORT, fetchImpl)).resolves.toEqual({ kind: 'point', point: { lat: 15.66, lng: 120.58 } })
  })
})
