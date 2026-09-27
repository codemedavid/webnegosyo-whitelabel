import {
  batchGeocodeAddresses,
  buildBatchGeocodeBody,
  isTrustworthyMatch,
  parseBatchGeocode,
} from '@/lib/superadmin/client-map/geocode'

function feature(lng: number, lat: number, featureType = 'place', place = 'Kalibo', region = 'Aklan') {
  return {
    properties: {
      feature_type: featureType,
      name: place,
      coordinates: { longitude: lng, latitude: lat },
      context: { place: { name: place }, region: { name: region } },
    },
  }
}

describe('buildBatchGeocodeBody', () => {
  it('pins every query to the Philippines with one result and no autocomplete', () => {
    expect(buildBatchGeocodeBody(['Kalibo, Aklan'])).toEqual([
      { q: 'Kalibo, Aklan', country: 'ph', limit: 1, autocomplete: false },
    ])
  })

  it('can restrict the retry pass to towns and cities', () => {
    expect(buildBatchGeocodeBody(['Batac'], 'locality,place')).toEqual([
      { q: 'Batac', country: 'ph', limit: 1, autocomplete: false, types: 'locality,place' },
    ])
  })
})

describe('parseBatchGeocode', () => {
  it('maps each address to its first feature, by position', () => {
    const payload = {
      batch: [{ features: [feature(122.36, 11.7)] }, { features: [] }, { features: [feature(120.93, 14.41)] }],
    }

    const hits = parseBatchGeocode(['Kalibo', 'nowhere', 'Imus'], payload)
    expect(Object.keys(hits)).toEqual(['Kalibo', 'Imus'])
    expect(hits.Kalibo.point).toEqual([122.36, 11.7])
    expect(hits.Kalibo.featureType).toBe('place')
    expect(hits.Kalibo.contextNames).toEqual(['Kalibo'])
  })

  it('returns nothing for a malformed payload', () => {
    expect(parseBatchGeocode(['Kalibo'], { oops: true })).toEqual({})
    expect(parseBatchGeocode(['Kalibo'], null)).toEqual({})
  })
})

describe('isTrustworthyMatch', () => {
  const hit = (featureType: string, names: string[]) => ({ point: [0, 0] as [number, number], featureType, contextNames: names })

  it('accepts a match whose town appears in the address, ignoring case, accents and "City"', () => {
    expect(isTrustworthyMatch('Susano Road, Camarin, Caloocan, Philippines', hit('street', ['Caloocan City', 'Metro Manila']))).toBe(true)
    expect(isTrustworthyMatch('Brgy. Sampaga, Balayan, Philippines', hit('locality', ['Balayán']))).toBe(true)
  })

  it('rejects a same-named street in a town the address never mentions', () => {
    expect(isTrustworthyMatch('Along National Highway, Batac, Philippines', hit('street', ['Consolacion', 'Cebu']))).toBe(false)
  })

  it('rejects province- or country-level matches as too vague to pin', () => {
    expect(isTrustworthyMatch('Camarines Norte', hit('region', ['Camarines Norte']))).toBe(false)
    expect(isTrustworthyMatch('Philippines', hit('country', ['Philippines']))).toBe(false)
  })
})

describe('batchGeocodeAddresses', () => {
  it('makes no request when there is nothing to geocode', async () => {
    const fetchImpl = jest.fn()
    await expect(batchGeocodeAddresses([], 'pk.test', fetchImpl)).resolves.toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs the batch and merges the result', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ batch: [{ features: [feature(125.6, 7.07, 'place', 'Davao City', 'Davao del Sur')] }] }),
    })

    const result = await batchGeocodeAddresses(['Davao City'], 'pk.test', fetchImpl)

    expect(result).toEqual({ 'Davao City': [125.6, 7.07] })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain('/search/geocode/v6/batch')
    expect(url).toContain('access_token=pk.test')
    expect(url).not.toContain('permanent')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toHaveLength(1)
  })

  it('retries a wrong-town match at town level and keeps it only if it is now right', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          batch: [
            { features: [feature(123.9, 10.4, 'street', 'Consolacion', 'Cebu')] },
            { features: [feature(125.6, 7.07, 'street', 'Davao City', 'Davao del Sur')] },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          batch: [
            { features: [feature(120.54, 18.05, 'place', 'Batac', 'Ilocos Norte')] },
            { features: [feature(125.6, 7.07, 'street', 'Davao City', 'Davao del Sur')] },
          ],
        }),
      })

    const result = await batchGeocodeAddresses(['National Highway, Batac', 'sambapa'], 'pk.test', fetchImpl)

    expect(result).toEqual({ 'National Highway, Batac': [120.54, 18.05] })
    const retryBody = JSON.parse(fetchImpl.mock.calls[1][1].body)
    expect(retryBody.map((q: { q: string; types: string }) => [q.q, q.types])).toEqual([
      ['National Highway, Batac', 'locality,place,district'],
      ['sambapa', 'locality,place,district'],
    ])
  })

  it('throws on a failed response so the failure is never cached', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    await expect(batchGeocodeAddresses(['Davao City'], 'pk.test', fetchImpl)).rejects.toThrow('401')
  })

  it('throws without a token', async () => {
    await expect(batchGeocodeAddresses(['Davao City'], '', jest.fn())).rejects.toThrow(/token/i)
  })
})
