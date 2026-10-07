import {
  PENDING_CLAIM_TTL_MS,
  buildDnsRecords,
  hostLabel,
  isClaimStale,
  ownershipChallenge,
  parseCustomDomainInput,
} from '@/lib/domains/domain-plan'

const ROOT = 'webnegosyo.com'

describe('parseCustomDomainInput', () => {
  it.each([
    ['order.bellaitalia.com', 'order.bellaitalia.com'],
    ['  BellaItalia.COM  ', 'bellaitalia.com'],
    ['https://www.bellaitalia.com/menu?x=1', 'bellaitalia.com'],
    ['bellaitalia.com:443', 'bellaitalia.com'],
    ['kapehan.com.ph', 'kapehan.com.ph'],
    ['shop.xn--80ak6aa92e.com', 'shop.xn--80ak6aa92e.com'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(parseCustomDomainInput(raw, ROOT)).toEqual({ ok: true, domain: expected })
  })

  it.each([
    [''],
    ['localhost'],
    ['bella italia.com'],
    ['bella_italia.com'],
    ['-bella.com'],
    ['192.168.1.10'],
    ['bella.c'],
    [`${'a'.repeat(64)}.com`],
  ])('rejects malformed input %p', (raw) => {
    expect(parseCustomDomainInput(raw, ROOT).ok).toBe(false)
  })

  it.each([['webnegosyo.com'], ['shop.webnegosyo.com'], ['my-app.vercel.app'], ['shop.webnegosyo.app'], ['smartmenu.ph'], ['seacook.smartmenu.ph']])(
    'refuses platform-owned host %s',
    (raw) => {
      const result = parseCustomDomainInput(raw, ROOT)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/own domain/i)
    },
  )
})

describe('hostLabel', () => {
  it('uses @ for the apex itself', () => {
    expect(hostLabel('bella.com', 'bella.com')).toBe('@')
  })

  it('strips the apex from a subdomain record', () => {
    expect(hostLabel('order.bella.com', 'bella.com')).toBe('order')
    expect(hostLabel('_vercel.bella.com.ph', 'bella.com.ph')).toBe('_vercel')
  })
})

describe('ownershipChallenge', () => {
  it('names a per-domain TXT record carrying the claim token', () => {
    expect(ownershipChallenge('order.bella.com', 'tok123')).toEqual({
      name: '_webnegosyo.order.bella.com',
      value: 'webnegosyo-verification=tok123',
    })
  })
})

describe('buildDnsRecords', () => {
  const base = {
    recommendedIPv4: '216.198.79.1',
    recommendedCNAME: 'abc123.vercel-dns-017.com',
    verification: [],
    ownership: null,
  }

  it('points an apex at the A record and adds the www CNAME', () => {
    const records = buildDnsRecords({ ...base, domain: 'bella.com', apexName: 'bella.com' })

    expect(records).toEqual([
      { type: 'A', host: '@', value: '216.198.79.1', purpose: 'routing' },
      { type: 'CNAME', host: 'www', value: 'abc123.vercel-dns-017.com', purpose: 'www' },
    ])
  })

  it('points a subdomain at the CNAME only', () => {
    const records = buildDnsRecords({ ...base, domain: 'order.bella.com', apexName: 'bella.com' })

    expect(records).toEqual([
      { type: 'CNAME', host: 'order', value: 'abc123.vercel-dns-017.com', purpose: 'routing' },
    ])
  })

  it('falls back to Vercel defaults when no recommendation came back', () => {
    const records = buildDnsRecords({
      ...base,
      domain: 'bella.com',
      apexName: 'bella.com',
      recommendedIPv4: null,
      recommendedCNAME: null,
    })

    expect(records.map((r) => r.value)).toEqual(['76.76.21.21', 'cname.vercel-dns.com'])
  })

  it('adds the store ownership TXT and any Vercel challenge as host labels', () => {
    const records = buildDnsRecords({
      ...base,
      domain: 'order.bella.com',
      apexName: 'bella.com',
      ownership: ownershipChallenge('order.bella.com', 'tok123'),
      verification: [
        { type: 'TXT', domain: '_vercel.bella.com', value: 'vc-domain-verify=order.bella.com,abc', reason: 'pending' },
      ],
    })

    expect(records.slice(1)).toEqual([
      { type: 'TXT', host: '_webnegosyo.order', value: 'webnegosyo-verification=tok123', purpose: 'ownership' },
      { type: 'TXT', host: '_vercel', value: 'vc-domain-verify=order.bella.com,abc', purpose: 'verification' },
    ])
  })
})

describe('isClaimStale', () => {
  const now = new Date('2026-09-29T00:00:00Z').getTime()

  it('is stale only past the TTL', () => {
    expect(isClaimStale(new Date(now - PENDING_CLAIM_TTL_MS - 1).toISOString(), now)).toBe(true)
    expect(isClaimStale(new Date(now - 60_000).toISOString(), now)).toBe(false)
  })

  it('treats a missing or unreadable time as fresh', () => {
    expect(isClaimStale(null, now)).toBe(false)
    expect(isClaimStale('not-a-date', now)).toBe(false)
  })
})
