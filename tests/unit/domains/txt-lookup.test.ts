import { createDohTxtLookup } from '@/lib/domains/txt-lookup'

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('createDohTxtLookup', () => {
  it('returns unquoted TXT values, joining split strings', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        Status: 0,
        Answer: [
          { type: 16, data: '"webnegosyo-verification=abc"' },
          { type: 16, data: '"part-one" "part-two"' },
          { type: 5, data: 'cname.example.com.' },
        ],
      }),
    )

    const result = await createDohTxtLookup(fetchImpl)('_webnegosyo.bella.com')

    expect(result).toEqual({ ok: true, values: ['webnegosyo-verification=abc', 'part-onepart-two'] })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://cloudflare-dns.com/dns-query?name=_webnegosyo.bella.com&type=TXT',
    )
    expect(fetchImpl.mock.calls[0][1].headers.Accept).toBe('application/dns-json')
  })

  it('treats a name that does not exist as no records', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { Status: 3 }))

    expect(await createDohTxtLookup(fetchImpl)('_webnegosyo.bella.com')).toEqual({ ok: true, values: [] })
  })

  it('reports a resolver failure instead of "no records"', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('timeout'))

    expect(await createDohTxtLookup(fetchImpl)('_webnegosyo.bella.com')).toEqual({ ok: false })
  })

  it('reports SERVFAIL as a failure', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { Status: 2 }))

    expect(await createDohTxtLookup(fetchImpl)('_webnegosyo.bella.com')).toEqual({ ok: false })
  })
})
